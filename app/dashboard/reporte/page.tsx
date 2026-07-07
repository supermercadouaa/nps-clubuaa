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
  const nowUTC = new Date();
  const argNow = new Date(nowUTC.getTime() - 3 * 60 * 60 * 1000);
  argNow.setUTCDate(argNow.getUTCDate() - 1);
  return `${argNow.getUTCFullYear()}-${String(argNow.getUTCMonth() + 1).padStart(2, '0')}-${String(argNow.getUTCDate()).padStart(2, '0')}`;
}

function fechaLabel(fecha: string): string {
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const [y, m, d] = fecha.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y} — ${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
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

/* ─── Data fetch ─── */
async function fetchData(fecha: string) {
  const pool = await getPool();

  const [npsResult, enviadosResult, [sucursalRows]] = await Promise.all([
    pool.request().input('fecha', fecha).query(`
      SELECT score, clasificacion, comentario, canal,
             cliente_id, ticket_id, respondido_at,
             score_experiencia, score_productos, score_precios, score_atencion,
             aspectos_mejorar
      FROM nps_respuestas
      WHERE respondido_at IS NOT NULL
        AND CAST(respondido_at AS DATE) = @fecha
      ORDER BY clasificacion ASC, score DESC
    `),
    pool.request().input('fecha', fecha).query(`
      SELECT COUNT(*) AS enviados
      FROM nps_enviar
      WHERE fh_enviometa IS NOT NULL
        AND CAST(fh_enviometa AS DATE) = @fecha
    `),
    mysqlPool.query<RowDataPacket[]>(`
      SELECT CAST(C_SUCURSAL AS CHAR) AS code, X_SUCURSAL AS name
      FROM ref_sucursal ORDER BY X_SUCURSAL
    `),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const npsRows: any[] = npsResult.recordset;
  const enviados: number = Number(enviadosResult.recordset[0]?.enviados ?? 0);

  const sucursalNameMap = new Map(
    (sucursalRows as RowDataPacket[]).map(r => [normCode(String(r.code))!, String(r.name).trim()])
  );

  // MySQL enrichment
  const ticketIds = [...new Set<number>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    npsRows.filter((r: any) => r.ticket_id > 0).map((r: any) => Number(r.ticket_id))
  )];

  const mysqlMap = new Map<number, { fecha_compra: string | null; hora_compra: string | null; c_sucursal: string | null; sucursal_nombre: string | null; nombre_cliente: string | null }>();

  if (ticketIds.length > 0) {
    try {
      interface MR extends RowDataPacket { ticket_id: number; fecha_compra: Date | null; hora_compra: string | null; c_sucursal: string | null; nombre_cliente: string | null; }
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
  const rows: Row[] = npsRows.map((row: any) => {
    const m = row.ticket_id > 0 ? mysqlMap.get(Number(row.ticket_id)) : undefined;
    return {
      score: Number(row.score), clasificacion: String(row.clasificacion),
      comentario: row.comentario ?? null, canal: String(row.canal),
      cliente_id: Number(row.cliente_id), ticket_id: Number(row.ticket_id),
      respondido_at: row.respondido_at instanceof Date ? row.respondido_at.toISOString() : String(row.respondido_at),
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

  return { rows, enviados };
}

/* ─── Sub-components ─── */
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

function Clasificacion({ c }: { c: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    promotor:  { label: 'Promotor',  color: '#15803d', bg: '#dcfce7' },
    pasivo:    { label: 'Pasivo',    color: '#92400e', bg: '#fef3c7' },
    detractor: { label: 'Detractor', color: '#b91c1c', bg: '#fee2e2' },
  };
  const s = map[c] ?? { label: c, color: '#374151', bg: '#f3f4f6' };
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
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
  const { rows, enviados } = await fetchData(fecha);

  // Metrics
  let promotores = 0, pasivos = 0, detractores = 0;
  for (const r of rows) {
    if (r.clasificacion === 'promotor') promotores++;
    else if (r.clasificacion === 'pasivo') pasivos++;
    else if (r.clasificacion === 'detractor') detractores++;
  }
  const total = rows.length;
  const nps = total > 0 ? Math.round(((promotores - detractores) / total) * 100) : 0;
  const tasaPct = enviados > 0 ? Math.round((rows.filter(r => r.cliente_id > 0).length / enviados) * 100) : 0;
  const avgExp  = avg(rows.map(r => r.score_experiencia));
  const avgProd = avg(rows.map(r => r.score_productos));
  const avgPrec = avg(rows.map(r => r.score_precios));
  const avgAten = avg(rows.map(r => r.score_atencion));

  // Aspectos
  const aspectoMap: Record<string, number> = {};
  for (const r of rows) {
    if (!r.aspectos_mejorar) continue;
    for (const a of r.aspectos_mejorar.split(',')) {
      const t = a.trim(); if (t) aspectoMap[t] = (aspectoMap[t] ?? 0) + 1;
    }
  }
  const aspectos = Object.entries(aspectoMap)
    .map(([a, n]) => ({ a, n, pct: total > 0 ? Math.round((n / total) * 100) : 0 }))
    .sort((a, b) => b.n - a.n);

  // Por sucursal
  const sucMap = new Map<string, { name: string; rows: Row[] }>();
  for (const r of rows) {
    if (!r.c_sucursal || !r.sucursal_nombre) continue;
    if (!sucMap.has(r.c_sucursal)) sucMap.set(r.c_sucursal, { name: r.sucursal_nombre, rows: [] });
    sucMap.get(r.c_sucursal)!.rows.push(r);
  }
  const porSucursal = Array.from(sucMap.entries()).map(([, { name, rows: sr }]) => {
    let p = 0, pa = 0, det = 0;
    for (const r of sr) {
      if (r.clasificacion === 'promotor') p++;
      else if (r.clasificacion === 'pasivo') pa++;
      else det++;
    }
    const n = sr.length;
    return {
      name, total: n,
      nps: n > 0 ? Math.round(((p - det) / n) * 100) : 0,
      avgScore: avg(sr.map(r => r.score)),
      avgExp: avg(sr.map(r => r.score_experiencia)),
      avgProd: avg(sr.map(r => r.score_productos)),
      avgPrec: avg(sr.map(r => r.score_precios)),
      avgAten: avg(sr.map(r => r.score_atencion)),
    };
  }).sort((a, b) => b.total - a.total);

  const comentarios = rows.filter(r => r.comentario?.trim());
  const npsColor = nps >= 50 ? '#15803d' : nps >= 0 ? '#b45309' : '#b91c1c';
  const npsLabel = nps >= 50 ? 'Bueno' : nps >= 0 ? 'Neutro' : 'Crítico';

  const hasData = total > 0;

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

      {/* ── Barra de navegación (no se imprime) ── */}
      <div className="no-print w-full py-3 px-6 flex items-center justify-between shadow-sm border-b bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-xs text-gray-500 hover:text-gray-800 transition-colors">
            ← Volver al dashboard
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-semibold text-gray-700">Reporte diario NPS</span>
        </div>
        <DateNav fecha={fecha} />
      </div>

      {/* ══════════════════════════════════════════
          PÁGINA 1 — RESUMEN EJECUTIVO
      ═══════════════════════════════════════════ */}
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Encabezado del reporte */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div style={{ background: UAA_PURPLE }} className="rounded-lg p-2">
                <Image src="/logo-clubuaa.png" alt="Club UAA" width={80} height={30} style={{ objectFit: 'contain' }} />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Reporte NPS</h1>
            <p className="text-gray-500 text-sm mt-0.5">{fechaLabel(fecha)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Generado por</p>
            <p className="text-xs font-medium text-gray-600">{email}</p>
          </div>
        </div>

        {!hasData ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">📭</p>
            <p className="text-lg font-semibold text-gray-700">Sin respuestas para esta fecha</p>
            <p className="text-sm text-gray-400 mt-1">Usá los botones de navegación para ir a otro día</p>
          </div>
        ) : (<>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Respuestas',   value: total,      sub: `de ${enviados} enviados` },
            { label: 'Promotores',   value: promotores, sub: `${total > 0 ? Math.round((promotores/total)*100) : 0}%` },
            { label: 'Detractores',  value: detractores, sub: `${total > 0 ? Math.round((detractores/total)*100) : 0}%` },
            { label: 'Tasa de resp.', value: `${tasaPct}%`, sub: `${rows.filter(r=>r.cliente_id>0).length} / ${enviados}` },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* NPS destacado + dimensiones */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">

          {/* NPS Score */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col items-center justify-center text-center">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">NPS Score</p>
            <p className="text-6xl font-black mb-2" style={{ color: npsColor }}>
              {nps > 0 ? `+${nps}` : nps}
            </p>
            <span className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ color: npsColor, background: npsColor + '18' }}>
              {npsLabel}
            </span>
            <p className="text-xs text-gray-400 mt-3">
              {promotores}P — {pasivos}N — {detractores}D
            </p>
          </div>

          {/* Dimensiones */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Dimensiones promedio</p>
            <div className="space-y-3">
              <ScoreBar label="Experiencia" value={avgExp} />
              <ScoreBar label="Productos"   value={avgProd} />
              <ScoreBar label="Precios"     value={avgPrec} />
              <ScoreBar label="Atención"    value={avgAten} />
            </div>
          </div>
        </div>

        {/* Aspectos a mejorar */}
        {aspectos.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-8">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Aspectos a mejorar</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {aspectos.map(({ a, n, pct }) => (
                <div key={a} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-44 shrink-0 truncate" title={a}>{a}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100">
                    <div className="h-2 rounded-full" style={{ width: `${aspectos.length > 0 ? (n / aspectos[0].n) * 100 : 0}%`, background: UAA_PURPLE }} />
                  </div>
                  <span className="text-xs font-bold w-16 text-right shrink-0" style={{ color: UAA_PURPLE }}>
                    {n} <span className="text-gray-400 font-normal">({pct}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            PÁGINA 2 — DETALLE POR SUCURSAL
        ═══════════════════════════════════════════ */}
        <div className="page-break pt-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Detalle por sucursal</p>
          {porSucursal.length === 0 ? (
            <p className="text-sm text-gray-400">Sin datos de sucursal para esta fecha.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: UAA_PURPLE }}>
                    {['Sucursal', 'Resp.', 'NPS', 'Score', 'Exp.', 'Prod.', 'Prec.', 'Aten.'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-white font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porSucursal.map((s, i) => {
                    const nc = s.nps >= 50 ? '#15803d' : s.nps >= 0 ? '#b45309' : '#b91c1c';
                    return (
                      <tr key={s.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 font-medium text-gray-800">{s.name}</td>
                        <td className="px-3 py-2 text-gray-600">{s.total}</td>
                        <td className="px-3 py-2 font-bold" style={{ color: nc }}>{s.nps > 0 ? `+${s.nps}` : s.nps}</td>
                        <td className="px-3 py-2 text-gray-600">{s.avgScore ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{s.avgExp  ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{s.avgProd ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{s.avgPrec ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{s.avgAten ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════
            PÁGINA 3 — COMENTARIOS
        ═══════════════════════════════════════════ */}
        <div className="page-break pt-2 mt-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Comentarios del día ({comentarios.length})
          </p>
          {comentarios.length === 0 ? (
            <p className="text-sm text-gray-400">No hubo comentarios este día.</p>
          ) : (
            <div className="space-y-3">
              {comentarios.map((r, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Clasificacion c={r.clasificacion} />
                      <span className="text-xs text-amber-400">{'★'.repeat(r.score)}{'☆'.repeat(5 - r.score)}</span>
                      {r.nombre_cliente && (
                        <span className="text-xs font-medium text-gray-700">{r.nombre_cliente}</span>
                      )}
                      {r.sucursal_nombre && (
                        <span className="text-xs text-gray-400">· {r.sucursal_nombre}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {r.fecha_compra ? `Compra: ${r.fecha_compra}` : ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{r.comentario}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">Club UAA — Dashboard NPS</p>
          <p className="text-xs text-gray-400">encuesta.clubuaa.ar/dashboard/reporte?fecha={fecha}</p>
        </div>

        </>)}
      </div>
    </>
  );
}
