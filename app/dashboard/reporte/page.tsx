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

const P = '#3b1f8c';   // UAA purple
const G = '#16a34a';   // green  (promotor)
const A = '#ca8a04';   // amber  (pasivo)
const R = '#dc2626';   // red    (detractor)

/* ─────────────────────── Helpers ─────────────────────── */
function normCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  return t.replace(/^0+/, '') || '0';
}
function offsetDate(fecha: string, days: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function dFmt(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
function dFmtShort(fecha: string): string {
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}
function dayName(fecha: string): string {
  const N = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const [y, m, d] = fecha.split('-').map(Number);
  return N[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
function dayNum(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function avg(nums: (number | null)[]): number | null {
  const v = nums.filter(n => n != null) as number[];
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

/* ─────────────────────── Period logic ─────────────────────── */
type Period = {
  dates: string[];           // response dates
  purchaseDates: string[];   // purchase dates (response date - 1)
  anchor: string;
  rangeLabel: string;        // "Vie 04/07 — Dom 06/07/2026"
  purchaseRangeLabel: string;// "Jue 03/07 — Sáb 05/07/2026"
  anchorLabel: string;       // "Lunes 07/07/2026"
  dayNames: string[];
};

function getPeriod(anchor: string): Period {
  const day = dayNum(anchor);
  const [y] = anchor.split('-');

  if (day === 1) { // Lunes → respuestas Vie+Sáb+Dom, compras Jue+Vie+Sáb
    const dates = [offsetDate(anchor, -3), offsetDate(anchor, -2), offsetDate(anchor, -1)];
    const pd    = dates.map(d => offsetDate(d, -1));
    return {
      dates, purchaseDates: pd, anchor,
      rangeLabel:         `Vie ${dFmtShort(dates[0])} — Dom ${dFmtShort(dates[2])}/${y}`,
      purchaseRangeLabel: `Jue ${dFmtShort(pd[0])} — Sáb ${dFmtShort(pd[2])}/${y}`,
      anchorLabel: `${dayName(anchor)} ${dFmt(anchor)}`,
      dayNames: ['Viernes','Sábado','Domingo'],
    };
  }
  if (day === 4) { // Jueves → respuestas Mar+Mié+Jue, compras Lun+Mar+Mié
    const dates = [offsetDate(anchor, -2), offsetDate(anchor, -1), anchor];
    const pd    = dates.map(d => offsetDate(d, -1));
    return {
      dates, purchaseDates: pd, anchor,
      rangeLabel:         `Mar ${dFmtShort(dates[0])} — Jue ${dFmtShort(anchor)}/${y}`,
      purchaseRangeLabel: `Lun ${dFmtShort(pd[0])} — Mié ${dFmtShort(pd[2])}/${y}`,
      anchorLabel: `${dayName(anchor)} ${dFmt(anchor)}`,
      dayNames: ['Martes','Miércoles','Jueves'],
    };
  }
  // Otro día
  const pd = [offsetDate(anchor, -1)];
  return {
    dates: [anchor], purchaseDates: pd, anchor,
    rangeLabel:         `${dayName(anchor)} ${dFmt(anchor)}`,
    purchaseRangeLabel: `${dayName(pd[0])} ${dFmt(pd[0])}`,
    anchorLabel: `${dayName(anchor)} ${dFmt(anchor)}`,
    dayNames: [dayName(anchor)],
  };
}

function getDefaultAnchor(): string {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000); // Argentina UTC-3
  const day = now.getUTCDay();
  // Días hacia atrás para llegar al Mon(1) o Thu(4) más reciente
  const back = [3, 0, 1, 2, 0, 1, 2][day];
  const dt = new Date(now.getTime() - back * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/* ─────────────────────── Types ─────────────────────── */
type Row = {
  score: number; clasificacion: string; comentario: string | null; canal: string;
  cliente_id: number; ticket_id: number; respondido_at: string;
  score_experiencia: number | null; score_productos: number | null;
  score_precios: number | null; score_atencion: number | null;
  aspectos_mejorar: string | null;
  fecha_compra: string | null; hora_compra: string | null;
  c_sucursal: string | null; sucursal_nombre: string | null; nombre_cliente: string | null;
};

/* ─────────────────────── Fetch ─────────────────────── */
async function fetchData(period: Period) {
  const pool = await getPool();

  // Enviados del período con IN parametrizado
  const reqEnv = pool.request();
  period.dates.forEach((d, i) => reqEnv.input(`d${i}`, d));
  const ph = period.dates.map((_, i) => `@d${i}`).join(', ');

  const [npsResult, envTotalRes, envPeriodRes, [sucursalRows]] = await Promise.all([
    pool.request().query(`
      SELECT score, clasificacion, comentario, canal,
             cliente_id, ticket_id, respondido_at,
             score_experiencia, score_productos, score_precios, score_atencion,
             aspectos_mejorar
      FROM nps_respuestas
      ORDER BY respondido_at DESC
    `),
    pool.request().query(`SELECT COUNT(*) AS n FROM nps_enviar WHERE fh_enviometa IS NOT NULL`),
    reqEnv.query(`SELECT COUNT(*) AS n FROM nps_enviar WHERE fh_enviometa IS NOT NULL AND CAST(fh_enviometa AS DATE) IN (${ph})`),
    mysqlPool.query<RowDataPacket[]>(`SELECT CAST(C_SUCURSAL AS CHAR) AS code, X_SUCURSAL AS name FROM ref_sucursal ORDER BY X_SUCURSAL`),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const npsRows: any[] = npsResult.recordset;
  const envTotal: number  = Number(envTotalRes.recordset[0]?.n ?? 0);
  const envPeriod: number = Number(envPeriodRes.recordset[0]?.n ?? 0);

  const sucMap = new Map(
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
      const ph2 = ticketIds.map(() => '?').join(', ');
      const [rows] = await mysqlPool.query<MR[]>(`
        SELECT t.c_idticket AS ticket_id, t.fechacorta AS fecha_compra, t.horaticket AS hora_compra,
               CAST(t.c_sucursal AS CHAR) AS c_sucursal,
               CONCAT(TRIM(COALESCE(c.x_nombres,'')), ' ', TRIM(COALESCE(c.x_apellidocli,''))) AS nombre_cliente
        FROM ticket_super t
        LEFT JOIN cliente_clubuaa c ON t.n_codcliente = c.c_cliente
        WHERE t.c_idticket IN (${ph2})
      `, ticketIds);
      for (const m of rows) {
        let fecha_compra: string | null = null;
        if (m.fecha_compra) {
          const dd = m.fecha_compra instanceof Date ? m.fecha_compra : new Date(String(m.fecha_compra));
          fecha_compra = `${String(dd.getUTCDate()).padStart(2,'0')}/${String(dd.getUTCMonth()+1).padStart(2,'0')}/${dd.getUTCFullYear()}`;
        }
        const cs = normCode(m.c_sucursal);
        mysqlMap.set(Number(m.ticket_id), {
          fecha_compra, hora_compra: m.hora_compra ?? null, c_sucursal: cs,
          sucursal_nombre: cs ? (sucMap.get(cs) ?? null) : null,
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

  const periodSet = new Set(period.dates);
  const periodRows = allRows.filter(r => periodSet.has(dateKey(r.respondido_at)));

  return { allRows, periodRows, envTotal, envPeriod };
}

/* ─────────────────────── Metrics ─────────────────────── */
function calcM(rows: Row[]) {
  let p = 0, pa = 0, d = 0;
  for (const r of rows) {
    if (r.clasificacion === 'promotor') p++;
    else if (r.clasificacion === 'pasivo') pa++;
    else if (r.clasificacion === 'detractor') d++;
  }
  const n = rows.length;
  return {
    n, p, pa, d,
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
    .sort((x, y) => y.n - x.n);
}

/* ─────────────────────── UI Components ─────────────────────── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: P }} />
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">{children}</h2>
    </div>
  );
}

function NpsHero({ nps, label }: { nps: number; label: string }) {
  const color = nps >= 50 ? G : nps >= 0 ? A : R;
  const badge = nps >= 50 ? 'Excelente' : nps >= 0 ? 'Bueno' : 'Crítico';
  const pct = Math.min(100, Math.max(0, (nps + 100) / 2)); // 0–100%
  return (
    <div className="flex flex-col items-center justify-center text-center py-4">
      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: P }}>{label}</p>
      <p className="font-black leading-none mb-1" style={{ fontSize: 72, color }}>
        {nps > 0 ? `+${nps}` : nps}
      </p>
      <span className="text-xs font-semibold px-3 py-1 rounded-full mb-3"
        style={{ color, background: color + '1a' }}>
        {badge}
      </span>
      {/* Linear NPS bar */}
      <div className="relative w-full max-w-xs h-2 rounded-full bg-gray-200">
        <div className="absolute top-0 bottom-0 w-0.5 bg-gray-400 rounded-full" style={{ left: '50%' }} />
        <div className="absolute top-0 bottom-0 rounded-full" style={{
          left:  nps >= 0 ? '50%' : `${pct}%`,
          width: `${Math.abs(nps) / 2}%`,
          background: color,
        }} />
      </div>
      <div className="flex justify-between w-full max-w-xs mt-1">
        <span className="text-gray-400" style={{ fontSize: 10 }}>-100</span>
        <span className="text-gray-400" style={{ fontSize: 10 }}>0</span>
        <span className="text-gray-400" style={{ fontSize: 10 }}>+100</span>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm text-center">
      <p className="text-xs text-gray-500 mb-1 font-medium">{label}</p>
      <p className="text-2xl font-black" style={{ color: color ?? '#111827' }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function DistBar({ p, pa, d, n }: { p: number; pa: number; d: number; n: number }) {
  if (n === 0) return <div className="h-4 rounded-full bg-gray-200" />;
  const pp = Math.round((p / n) * 100);
  const pap = Math.round((pa / n) * 100);
  const dp = 100 - pp - pap;
  return (
    <div>
      <div className="flex h-5 rounded-xl overflow-hidden gap-0.5">
        {pp > 0  && <div style={{ width: `${pp}%`,  background: G }} />}
        {pap > 0 && <div style={{ width: `${pap}%`, background: A }} />}
        {dp > 0  && <div style={{ width: `${dp}%`,  background: R }} />}
      </div>
      <div className="flex justify-between mt-1.5 text-xs">
        <span style={{ color: G }} className="font-semibold">● {p} Promotores ({pp}%)</span>
        <span style={{ color: A }} className="font-semibold">● {pa} Pasivos ({pap}%)</span>
        <span style={{ color: R }} className="font-semibold">● {d} Detractores ({dp}%)</span>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, total }: { label: string; value: number | null; total?: number | null }) {
  const v = value ?? 0;
  const showTotal = total !== undefined;
  const color = v >= 4 ? G : v >= 3 ? A : R;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 font-medium w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-gray-100">
        <div className="h-2.5 rounded-full transition-all" style={{ width: `${(v / 5) * 100}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-8 text-right tabular-nums" style={{ color }}>
        {v > 0 ? v : '—'}
      </span>
      {showTotal && (
        <span className="text-xs text-gray-300 w-8 text-right tabular-nums">{total ?? '—'}</span>
      )}
    </div>
  );
}

function PageHeader({ period, subtitle }: { period: Period; subtitle?: string }) {
  return (
    <div className="py-4 mb-6 border-b-2" style={{ borderColor: P }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-1.5" style={{ background: P }}>
            <Image src="/logo-clubuaa.png" alt="Club UAA" width={60} height={22} style={{ objectFit: 'contain' }} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest" style={{ color: P }}>Reporte NPS · Supermercados UAA</p>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle ?? `Emitido el ${period.anchorLabel}`}</p>
          </div>
        </div>
      </div>
      {/* Period breakdown row */}
      <div className="flex gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Compras analizadas</span>
          <span className="text-xs font-black px-2 py-0.5 rounded" style={{ background: P + '15', color: P }}>
            {period.purchaseRangeLabel}
          </span>
        </div>
        <div className="w-px bg-gray-200 self-stretch" />
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Respuestas recibidas</span>
          <span className="text-xs font-black px-2 py-0.5 rounded" style={{ background: '#6366f115', color: '#4f46e5' }}>
            {period.rangeLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── Page ─────────────────────── */
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
  const anchor = fechaParam ?? getDefaultAnchor();
  const period = getPeriod(anchor);
  const { allRows, periodRows, envTotal, envPeriod } = await fetchData(period);

  // Métricas del período
  const pm = calcM(periodRows);
  const tasaPeriod = envPeriod > 0 ? Math.round((periodRows.filter(r => r.cliente_id > 0).length / envPeriod) * 100) : 0;

  // Métricas acumuladas
  const am = calcM(allRows);
  const tasaAcum  = envTotal  > 0 ? Math.round((allRows.filter(r => r.cliente_id > 0).length / envTotal)  * 100) : 0;

  // Aspectos (acumulado)
  const aspectos = calcAspectos(allRows);
  const maxAsp = aspectos.length > 0 ? aspectos[0].n : 1;

  // Comentarios del período (promotores→pasivos→detractores)
  const comentarios = periodRows
    .filter(r => r.comentario?.trim())
    .sort((a, b) => b.score - a.score);

  // Colores
  const pNpsColor = pm.nps >= 50 ? G : pm.nps >= 0 ? A : R;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1.2cm 1.5cm; }
          .no-print { display: none !important; }
          .page-break { break-before: page; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 11px; }
        }
        @media screen {
          body { background: #f3f4f6; }
        }
      `}</style>

      {/* ── Navbar ── */}
      <div className="no-print w-full py-3 px-6 flex items-center justify-between border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            ← Dashboard
          </Link>
          <span className="text-gray-200">|</span>
          <span className="text-sm font-semibold text-gray-700">Reporte NPS</span>
        </div>
        <DateNav fecha={anchor} />
      </div>

      {/* ════════════════ PÁGINA 1 — PERÍODO ACTUAL ════════════════ */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <PageHeader period={period} />

        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* NPS Hero */}
          <div className="col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <NpsHero nps={pm.nps} label="NPS del Período" />
          </div>

          {/* KPIs + Distribución */}
          <div className="col-span-2 flex flex-col gap-4">
            <div className="grid grid-cols-4 gap-3">
              <KpiCard label="Respuestas" value={pm.n} sub={`de ${envPeriod} enviados`} />
              <KpiCard label="Tasa" value={`${tasaPeriod}%`} sub="de respuesta" color={pNpsColor} />
              <KpiCard label="Promotores" value={pm.p} sub={`${pm.n > 0 ? Math.round((pm.p/pm.n)*100) : 0}%`} color={G} />
              <KpiCard label="Detractores" value={pm.d} sub={`${pm.n > 0 ? Math.round((pm.d/pm.n)*100) : 0}%`} color={R} />
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Distribución de respuestas</p>
              <DistBar p={pm.p} pa={pm.pa} d={pm.d} n={pm.n} />
            </div>
          </div>
        </div>

        {/* Dimensiones del período */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <SectionTitle>Dimensiones promedio — período</SectionTitle>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
            <ScoreBar label="Experiencia general" value={pm.avgExp} />
            <ScoreBar label="Calidad de productos" value={pm.avgProd} />
            <ScoreBar label="Precios"               value={pm.avgPrec} />
            <ScoreBar label="Atención al cliente"   value={pm.avgAten} />
          </div>
        </div>

        {/* Referencia acumulada */}
        {(() => {
          const aNpsC = am.nps >= 50 ? G : am.nps >= 0 ? A : R;
          const aTasaC = tasaAcum >= 30 ? G : tasaAcum >= 15 ? A : R;
          const scoreC = (v: number | null) => v == null ? '#9ca3af' : v >= 4 ? G : v >= 3 ? A : R;
          const items = [
            { l: 'NPS acum.',    v: am.nps > 0 ? `+${am.nps}` : String(am.nps), c: aNpsC },
            { l: 'Tasa acum.',   v: `${tasaAcum}%`,     c: aTasaC },
            { l: 'Experiencia',  v: am.avgExp ?? '—',   c: scoreC(am.avgExp) },
            { l: 'Productos',    v: am.avgProd ?? '—',  c: scoreC(am.avgProd) },
            { l: 'Precios',      v: am.avgPrec ?? '—',  c: scoreC(am.avgPrec) },
            { l: 'Atención',     v: am.avgAten ?? '—',  c: scoreC(am.avgAten) },
          ];
          return (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 flex flex-wrap items-center gap-6">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 shrink-0">Histórico acumulado</p>
              {items.map(({ l, v, c }) => (
                <div key={l} className="text-center">
                  <p className="text-xs text-gray-400">{l}</p>
                  <p className="text-base font-black" style={{ color: c }}>{v}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ════════════════ PÁGINA 2 — ASPECTOS ════════════════ */}
        <div className="page-break mt-0 pt-8">
          <PageHeader period={period} subtitle="Análisis — datos acumulados" />

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionTitle>Aspectos a mejorar — acumulado ({allRows.length} respuestas)</SectionTitle>
            {aspectos.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos.</p>
            ) : (
              <div className="space-y-2.5">
                {aspectos.map(({ a, n, pct }, i) => {
                  const good = a.toLowerCase().includes('conforme');
                  const c = good ? G : P;
                  return (
                    <div key={a} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-5 text-right shrink-0">{i + 1}</span>
                      <span className="text-xs text-gray-700 w-52 shrink-0 truncate" title={a}>{a}</span>
                      <div className="flex-1 h-2.5 rounded-full bg-gray-100">
                        <div className="h-2.5 rounded-full" style={{ width: `${(n / maxAsp) * 100}%`, background: c }} />
                      </div>
                      <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: c, minWidth: 60, textAlign: 'right' }}>
                        {n} <span className="font-normal text-gray-400">({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ════════════════ PÁGINA 3 — COMENTARIOS ════════════════ */}
        <div className="page-break mt-0 pt-8">
          <PageHeader period={period} subtitle={`Comentarios del período — ${comentarios.length} comentario${comentarios.length !== 1 ? 's' : ''}`} />

          {comentarios.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-3xl mb-3">💬</p>
              <p className="text-sm text-gray-500">No hubo comentarios en este período.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full" style={{ fontSize: 11 }}>
                <thead>
                  <tr style={{ background: P }}>
                    <th className="px-3 py-2.5 text-left text-white font-semibold w-20">Clasif.</th>
                    <th className="px-3 py-2.5 text-left text-white font-semibold w-8">★</th>
                    <th className="px-3 py-2.5 text-left text-white font-semibold w-28">Cliente</th>
                    <th className="px-3 py-2.5 text-left text-white font-semibold w-28">Sucursal</th>
                    <th className="px-3 py-2.5 text-left text-white font-semibold">Comentario</th>
                  </tr>
                </thead>
                <tbody>
                  {comentarios.map((r, i) => {
                    const [label, color, bg] = r.clasificacion === 'promotor'
                      ? ['Promotor', G, '#dcfce7']
                      : r.clasificacion === 'pasivo'
                      ? ['Pasivo', A, '#fef3c7']
                      : ['Detractor', R, '#fee2e2'];
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2">
                          <span className="font-semibold px-1.5 py-0.5 rounded" style={{ color, background: bg, fontSize: 10 }}>
                            {label}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-bold tabular-nums" style={{ color: A }}>{r.score}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[7rem] truncate" title={r.nombre_cliente ?? ''}>
                          {r.nombre_cliente ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-[7rem] truncate" title={r.sucursal_nombre ?? ''}>
                          {r.sucursal_nombre ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-700 leading-snug">{r.comentario}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-gray-200 flex items-center justify-between text-gray-400" style={{ fontSize: 10 }}>
          <span>Club UAA · Dashboard NPS · {email}</span>
          <span>encuesta.clubuaa.ar/dashboard/reporte?fecha={anchor}</span>
        </div>
      </div>
    </>
  );
}
