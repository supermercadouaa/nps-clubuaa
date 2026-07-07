export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { RowDataPacket } from 'mysql2';
import { verifySession } from '@/lib/auth';
import { getPool } from '@/lib/mssql';
import mysqlPool from '@/lib/mysql';
import DateNav from './DateNav';

const UAA_PURPLE = '#3b1f8c';

/* ─── Helpers ─── */
function normCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  return t.replace(/^0+/, '') || '0';
}

function getYesterdayArg(): string {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  now.setUTCDate(now.getUTCDate() - 1);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function isMonday(fecha: string): boolean {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

function prevDay(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function dFmt(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function fechaLabel(fecha: string): string {
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const [y, m, d] = fecha.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y} — ${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
}

// Cuando es lunes, agrupa Dom + Lun como un solo período
function ayerLabel(fecha: string): string {
  if (!isMonday(fecha)) return fechaLabel(fecha);
  const dom = prevDay(fecha);
  return `Dom ${dFmt(dom)} + Lun ${dFmt(fecha)} (fin de semana)`;
}

function avg(nums: (number | null)[]): number | null {
  const v = nums.filter(n => n != null) as number[];
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

type Row = {
  score: number; clasificacion: string; comentario: string | null; canal: string;
  cliente_id: number; ticket_id: number; respondido_at: string;
  score_experiencia: number | null; score_productos: number | null;
  score_precios: number | null; score_atencion: number | null;
  aspectos_mejorar: string | null;
  fecha_compra: string | null; hora_compra: string | null;
  c_sucursal: string | null; sucursal_nombre: string | null; nombre_cliente: string | null;
};

/* ─── Data fetch — trae TODO, filtra en JS ─── */
async function fetchData(fechaAyer: string) {
  const pool = await getPool();

  // Si es lunes, los enviados del "período" son los del domingo
  // (el sábado se compra, el domingo se envía la encuesta, el lunes no se envía nada)
  const fechaEnviados = isMonday(fechaAyer) ? prevDay(fechaAyer) : fechaAyer;

  const [npsResult, enviadosTotalRes, enviadosAyerRes, [sucursalRows]] = await Promise.all([
    pool.request().query(`
      SELECT score, clasificacion, comentario, canal,
             cliente_id, ticket_id, respondido_at,
             score_experiencia, score_productos, score_precios, score_atencion,
             aspectos_mejorar
      FROM nps_respuestas
      ORDER BY respondido_at DESC
    `),
    pool.request().query(`SELECT COUNT(*) AS enviados FROM nps_enviar WHERE fh_enviometa IS NOT NULL`),
    pool.request().input('fecha', fechaEnviados).query(`
      SELECT COUNT(*) AS enviados FROM nps_enviar
      WHERE fh_enviometa IS NOT NULL AND CAST(fh_enviometa AS DATE) = @fecha
    `),
    mysqlPool.query<RowDataPacket[]>(`
      SELECT CAST(C_SUCURSAL AS CHAR) AS code, X_SUCURSAL AS name
      FROM ref_sucursal ORDER BY X_SUCURSAL
    `),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const npsRows: any[] = npsResult.recordset;
  const enviadosTotal: number = Number(enviadosTotalRes.recordset[0]?.enviados ?? 0);
  const enviadosAyer: number  = Number(enviadosAyerRes.recordset[0]?.enviados ?? 0);

  const sucursalNameMap = new Map(
    (sucursalRows as RowDataPacket[]).map(r => [normCode(String(r.code))!, String(r.name).trim()])
  );

  // MySQL enrichment
  const ticketIds = [...new Set<number>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    npsRows.filter((r: any) => r.ticket_id > 0).map((r: any) => Number(r.ticket_id))
  )];

  const mysqlMap = new Map<number, {
    fecha_compra: string | null; hora_compra: string | null;
    c_sucursal: string | null; sucursal_nombre: string | null; nombre_cliente: string | null;
  }>();

  if (ticketIds.length > 0) {
    try {
      interface MR extends RowDataPacket {
        ticket_id: number; fecha_compra: Date | null; hora_compra: string | null;
        c_sucursal: string | null; nombre_cliente: string | null;
      }
      const ph = ticketIds.map(() => '?').join(', ');
      const [rows] = await mysqlPool.query<MR[]>(`
        SELECT t.c_idticket AS ticket_id, t.fechacorta AS fecha_compra,
               t.horaticket AS hora_compra, CAST(t.c_sucursal AS CHAR) AS c_sucursal,
               CONCAT(TRIM(COALESCE(c.x_nombres,'')), ' ', TRIM(COALESCE(c.x_apellidocli,''))) AS nombre_cliente
        FROM ticket_super t
        LEFT JOIN cliente_clubuaa c ON t.n_codcliente = c.c_cliente
        WHERE t.c_idticket IN (${ph})
      `, ticketIds);
      for (const m of rows) {
        let fecha_compra: string | null = null;
        if (m.fecha_compra) {
          const d = m.fecha_compra instanceof Date ? m.fecha_compra : new Date(String(m.fecha_compra));
          fecha_compra = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
        }
        const cSucursal = normCode(m.c_sucursal);
        mysqlMap.set(Number(m.ticket_id), {
          fecha_compra, hora_compra: m.hora_compra ?? null, c_sucursal: cSucursal,
          sucursal_nombre: cSucursal ? (sucursalNameMap.get(cSucursal) ?? null) : null,
          nombre_cliente: m.nombre_cliente?.trim() || null,
        });
      }
    } catch (e) { console.error('[reporte MySQL]', e); }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows: Row[] = npsRows.map((row: any) => {
    const m = row.ticket_id > 0 ? mysqlMap.get(Number(row.ticket_id)) : undefined;
    const rawAt = row.respondido_at;
    const safeIso = rawAt
      ? (rawAt instanceof Date ? rawAt : new Date(String(rawAt))).toISOString()
      : new Date(0).toISOString();
    return {
      score: Number(row.score), clasificacion: String(row.clasificacion),
      comentario: row.comentario ?? null, canal: String(row.canal),
      cliente_id: Number(row.cliente_id), ticket_id: Number(row.ticket_id),
      respondido_at: safeIso,
      score_experiencia: row.score_experiencia != null ? Number(row.score_experiencia) : null,
      score_productos:   row.score_productos   != null ? Number(row.score_productos)   : null,
      score_precios:     row.score_precios     != null ? Number(row.score_precios)     : null,
      score_atencion:    row.score_atencion    != null ? Number(row.score_atencion)    : null,
      aspectos_mejorar: row.aspectos_mejorar ?? null,
      fecha_compra: m?.fecha_compra ?? null, hora_compra: m?.hora_compra ?? null,
      c_sucursal: m?.c_sucursal ?? null, sucursal_nombre: m?.sucursal_nombre ?? null,
      nombre_cliente: m?.nombre_cliente ?? null,
    };
  });

  const ayerRows = allRows.filter(r => dateKey(r.respondido_at) === fechaAyer);

  return { allRows, ayerRows, enviadosTotal, enviadosAyer };
}

/* ─── Metrics ─── */
function calcMetrics(rows: Row[]) {
  let p = 0, pa = 0, d = 0;
  for (const r of rows) {
    if (r.clasificacion === 'promotor') p++;
    else if (r.clasificacion === 'pasivo') pa++;
    else if (r.clasificacion === 'detractor') d++;
  }
  const n = rows.length;
  return {
    total: n, promotores: p, pasivos: pa, detractores: d,
    nps: n > 0 ? Math.round(((p - d) / n) * 100) : 0,
    avgExp:  avg(rows.map(r => r.score_experiencia)),
    avgProd: avg(rows.map(r => r.score_productos)),
    avgPrec: avg(rows.map(r => r.score_precios)),
    avgAten: avg(rows.map(r => r.score_atencion)),
  };
}

function calcAspectos(rows: Row[]) {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (!r.aspectos_mejorar) continue;
    for (const a of r.aspectos_mejorar.split(',')) {
      const t = a.trim(); if (t) counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  const total = rows.length;
  return Object.entries(counts)
    .map(([a, n]) => ({ a, n, pct: total > 0 ? Math.round((n / total) * 100) : 0 }))
    .sort((a, b) => b.n - a.n);
}

function calcBySucursal(rows: Row[]) {
  const map = new Map<string, { name: string; rows: Row[] }>();
  for (const r of rows) {
    if (!r.c_sucursal || !r.sucursal_nombre) continue;
    if (!map.has(r.c_sucursal)) map.set(r.c_sucursal, { name: r.sucursal_nombre, rows: [] });
    map.get(r.c_sucursal)!.rows.push(r);
  }
  return Array.from(map.values()).map(({ name, rows: sr }) => {
    const m = calcMetrics(sr);
    return { name, total: sr.length, nps: m.nps, avgScore: avg(sr.map(r => r.score)),
      avgExp: m.avgExp, avgProd: m.avgProd, avgPrec: m.avgPrec, avgAten: m.avgAten };
  }).sort((a, b) => b.total - a.total);
}

/* ─── UI helpers ─── */
function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-200">
        <div className="h-2 rounded-full" style={{ width: `${(v / 5) * 100}%`, background: UAA_PURPLE }} />
      </div>
      <span className="text-xs font-bold w-6 text-right">{v > 0 ? v : '—'}</span>
    </div>
  );
}

function Clasif({ c }: { c: string }) {
  const map: Record<string, [string, string, string]> = {
    promotor:  ['Promotor',  '#15803d', '#dcfce7'],
    pasivo:    ['Pasivo',    '#92400e', '#fef3c7'],
    detractor: ['Detractor', '#b91c1c', '#fee2e2'],
  };
  const [label, color, bg] = map[c] ?? [c, '#374151', '#f3f4f6'];
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color, background: bg }}>
      {label}
    </span>
  );
}

function NpsNum({ nps }: { nps: number }) {
  const color = nps >= 50 ? '#15803d' : nps >= 0 ? '#b45309' : '#b91c1c';
  return <span style={{ color }} className="font-black">{nps > 0 ? `+${nps}` : nps}</span>;
}

/* ─── Page ─── */
export default async function ReportePage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('nps_session')?.value;
  const email = token ? verifySession(token) : null;
  if (!email) redirect('/dashboard/login');

  const { fecha: fechaParam } = await searchParams;
  const fecha = fechaParam ?? getYesterdayArg();

  const { allRows, enviadosTotal, enviadosAyer } = await fetchData(fecha);

  // Si es lunes, el período "ayer" abarca Dom + Lun
  const esLunes = isMonday(fecha);
  const fechaDomingo = esLunes ? prevDay(fecha) : null;
  const ayerRows = allRows.filter(r => {
    const dk = dateKey(r.respondido_at);
    return dk === fecha || (esLunes && dk === fechaDomingo);
  });

  // Acumulado
  const acc = calcMetrics(allRows);
  const aspectos = calcAspectos(allRows);
  const porSucursal = calcBySucursal(allRows);
  const tasaAcum = enviadosTotal > 0
    ? Math.round((allRows.filter(r => r.cliente_id > 0).length / enviadosTotal) * 100)
    : 0;

  // Ayer
  const ay = calcMetrics(ayerRows);
  const tasaAyer = enviadosAyer > 0
    ? Math.round((ayerRows.filter(r => r.cliente_id > 0).length / enviadosAyer) * 100)
    : 0;

  const comentarios = ayerRows.filter(r => r.comentario?.trim())
    .sort((a, b) => b.score - a.score); // promotores primero

  const accNpsColor = acc.nps >= 50 ? '#15803d' : acc.nps >= 0 ? '#b45309' : '#b91c1c';
  const maxAspecto = aspectos.length > 0 ? aspectos[0].n : 1;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 1.5cm; }
          .no-print { display: none !important; }
          .page-break { break-before: page; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* ── Nav bar (no se imprime) ── */}
      <div className="no-print w-full py-3 px-6 flex items-center justify-between border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-xs text-gray-500 hover:text-gray-800 transition-colors">
            ← Volver al dashboard
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-semibold text-gray-700">Reporte NPS — Acumulado</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 hidden sm:inline">
            {esLunes ? 'Período Dom+Lun:' : 'Comentarios de:'}
          </span>
          <DateNav fecha={fecha} />
          {esLunes && (
            <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md hidden sm:inline">
              Dom {dFmt(fechaDomingo!)} + Lun {dFmt(fecha)}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 bg-gray-50 min-h-screen">

        {/* ══════════════════════════════════════════
            PÁGINA 1 — RESUMEN ACUMULADO
        ═══════════════════════════════════════════ */}

        {/* Header del reporte */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div style={{ background: UAA_PURPLE }} className="rounded-xl p-2.5">
              <Image src="/logo-clubuaa.png" alt="Club UAA" width={80} height={28} style={{ objectFit: 'contain' }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Reporte NPS — Acumulado</h1>
              <p className="text-xs text-gray-500 mt-0.5">Generado el {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} · {email}</p>
            </div>
          </div>
        </div>

        {/* ── Resumen de ayer (poca importancia) ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {ayerLabel(fecha)}
          </p>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-gray-500">NPS</p>
              <p className="text-xl font-bold"><NpsNum nps={ay.nps} /></p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Respuestas</p>
              <p className="text-xl font-bold text-gray-800">{ay.total}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Enviados</p>
              <p className="text-xl font-bold text-gray-800">{enviadosAyer}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Tasa</p>
              <p className="text-xl font-bold text-gray-800">{tasaAyer}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Promotores</p>
              <p className="text-xl font-bold text-green-600">{ay.promotores}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Pasivos</p>
              <p className="text-xl font-bold text-yellow-600">{ay.pasivos}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Detractores</p>
              <p className="text-xl font-bold text-red-600">{ay.detractores}</p>
            </div>
            {ay.avgExp && <div><p className="text-xs text-gray-500">Exp.</p><p className="text-xl font-bold text-gray-800">{ay.avgExp}</p></div>}
            {ay.avgProd && <div><p className="text-xs text-gray-500">Prod.</p><p className="text-xl font-bold text-gray-800">{ay.avgProd}</p></div>}
            {ay.avgPrec && <div><p className="text-xs text-gray-500">Prec.</p><p className="text-xl font-bold text-gray-800">{ay.avgPrec}</p></div>}
            {ay.avgAten && <div><p className="text-xs text-gray-500">Aten.</p><p className="text-xl font-bold text-gray-800">{ay.avgAten}</p></div>}
          </div>
        </div>

        {/* ── KPIs acumulados ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total respuestas', value: acc.total, sub: 'acumulado' },
            { label: 'Promotores',       value: acc.promotores, sub: `${acc.total > 0 ? Math.round((acc.promotores/acc.total)*100) : 0}% del total` },
            { label: 'Detractores',      value: acc.detractores, sub: `${acc.total > 0 ? Math.round((acc.detractores/acc.total)*100) : 0}% del total` },
            { label: 'Tasa de respuesta', value: `${tasaAcum}%`, sub: `${allRows.filter(r=>r.cliente_id>0).length} / ${enviadosTotal}` },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* ── NPS acumulado + dimensiones ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col items-center justify-center text-center">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">NPS Acumulado</p>
            <p className="text-7xl font-black mb-2" style={{ color: accNpsColor }}>
              {acc.nps > 0 ? `+${acc.nps}` : acc.nps}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {acc.promotores} promotores · {acc.pasivos} pasivos · {acc.detractores} detractores
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Dimensiones promedio acumuladas</p>
            <div className="space-y-3">
              <ScoreBar label="Experiencia" value={acc.avgExp} />
              <ScoreBar label="Productos"   value={acc.avgProd} />
              <ScoreBar label="Precios"     value={acc.avgPrec} />
              <ScoreBar label="Atención"    value={acc.avgAten} />
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            PÁGINA 2 — ASPECTOS + SUCURSALES
        ═══════════════════════════════════════════ */}
        <div className="page-break">

          {/* Aspectos a mejorar */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Aspectos a mejorar — acumulado
            </p>
            {aspectos.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos.</p>
            ) : (
              <div className="space-y-2.5">
                {aspectos.map(({ a, n, pct }) => {
                  const good = a.toLowerCase().includes('conforme');
                  const color = good ? '#15803d' : UAA_PURPLE;
                  return (
                    <div key={a} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-52 shrink-0 truncate" title={a}>{a}</span>
                      <div className="flex-1 h-2.5 rounded-full bg-gray-100">
                        <div className="h-2.5 rounded-full" style={{ width: `${(n / maxAspecto) * 100}%`, background: color }} />
                      </div>
                      <span className="text-xs font-bold w-20 text-right shrink-0" style={{ color }}>
                        {n} <span className="text-gray-400 font-normal">({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Por sucursal */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Desglose por sucursal — acumulado</p>
            </div>
            {porSucursal.length === 0 ? (
              <p className="p-5 text-sm text-gray-400">Sin datos de sucursal.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: UAA_PURPLE }}>
                    {['Sucursal', 'Respuestas', 'NPS', 'Score', 'Experiencia', 'Productos', 'Precios', 'Atención'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-white font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porSucursal.map((s, i) => {
                    const nc = s.nps >= 50 ? '#15803d' : s.nps >= 0 ? '#b45309' : '#b91c1c';
                    return (
                      <tr key={s.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2.5 font-medium text-gray-800">{s.name}</td>
                        <td className="px-3 py-2.5 text-gray-600">{s.total}</td>
                        <td className="px-3 py-2.5 font-bold" style={{ color: nc }}>{s.nps > 0 ? `+${s.nps}` : s.nps}</td>
                        <td className="px-3 py-2.5 text-gray-600">{s.avgScore ?? '—'}</td>
                        <td className="px-3 py-2.5 text-gray-600">{s.avgExp  ?? '—'}</td>
                        <td className="px-3 py-2.5 text-gray-600">{s.avgProd ?? '—'}</td>
                        <td className="px-3 py-2.5 text-gray-600">{s.avgPrec ?? '—'}</td>
                        <td className="px-3 py-2.5 text-gray-600">{s.avgAten ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════
            PÁGINA 3 — COMENTARIOS DE AYER
        ═══════════════════════════════════════════ */}
        <div className="page-break mt-8">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Comentarios — {ayerLabel(fecha)}
              </p>
              <span className="text-xs text-gray-400">{comentarios.length} comentario{comentarios.length !== 1 ? 's' : ''}</span>
            </div>
            {comentarios.length === 0 ? (
              <p className="p-6 text-sm text-gray-400">No hubo comentarios este día.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {comentarios.map((r, i) => (
                  <div key={i} className="px-5 py-4">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <Clasif c={r.clasificacion} />
                      <span className="text-xs text-amber-400 tracking-tight">
                        {'★'.repeat(r.score)}{'☆'.repeat(5 - r.score)}
                      </span>
                      {r.nombre_cliente && (
                        <span className="text-xs font-medium text-gray-700">{r.nombre_cliente}</span>
                      )}
                      {r.sucursal_nombre && (
                        <span className="text-xs text-gray-400">· {r.sucursal_nombre}</span>
                      )}
                      {r.fecha_compra && (
                        <span className="text-xs text-gray-400 ml-auto">Compra: {r.fecha_compra}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{r.comentario}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-400">Club UAA — Dashboard NPS</p>
          <p className="text-xs text-gray-400">encuesta.clubuaa.ar/dashboard/reporte?fecha={fecha}</p>
        </div>

      </div>
    </>
  );
}
