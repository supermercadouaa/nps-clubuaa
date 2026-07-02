export const dynamic = 'force-dynamic';

import Image from 'next/image';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { verifySession } from '@/lib/auth';
import { getPool } from '@/lib/mssql';
import mysqlPool from '@/lib/mysql';
import AutoRefresh from './AutoRefresh';
import LogoutButton from './LogoutButton';
import SucursalFilter from './SucursalFilter';

const UAA_PURPLE = '#3b1f8c';
const UAA_LIGHT  = '#f3f0ff';

/* ─── Types ─── */
type NpsRow = {
  score: number;
  clasificacion: string;
  comentario: string | null;
  canal: string;
  cliente_id: number;
  ticket_id: number;
  respondido_at: Date;
  score_experiencia: number | null;
  score_productos: number | null;
  score_precios: number | null;
  score_atencion: number | null;
  aspectos_mejorar: string | null;
};

interface MysqlRow extends RowDataPacket {
  ticket_id: number;
  fecha_compra: Date | null;
  hora_compra: string | null;
  c_sucursal: string;
  sucursal_nombre: string;
  nombre_cliente: string;
}

type EnrichedRow = NpsRow & {
  fecha_compra?: Date | null;
  hora_compra?: string | null;
  c_sucursal?: string;
  sucursal_nombre?: string;
  nombre_cliente?: string;
};

/* ─── Data fetching ─── */
async function getAllResponses(): Promise<NpsRow[]> {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT score, clasificacion, comentario, canal,
           cliente_id, ticket_id, respondido_at,
           score_experiencia, score_productos, score_precios, score_atencion,
           aspectos_mejorar
    FROM nps_respuestas
    ORDER BY respondido_at DESC
  `);
  return r.recordset as NpsRow[];
}

async function getMySQLData(ticketIds: number[]): Promise<MysqlRow[]> {
  if (ticketIds.length === 0) return [];
  try {
    const placeholders = ticketIds.map(() => '?').join(', ');
    const [rows] = await mysqlPool.query<MysqlRow[]>(
      `SELECT
         t.c_idticket                                        AS ticket_id,
         t.fechacorta                                        AS fecha_compra,
         t.horaticket                                        AS hora_compra,
         t.c_sucursal                                        AS c_sucursal,
         r.X_SUCURSAL                                        AS sucursal_nombre,
         CONCAT(TRIM(c.x_nombres), ' ', TRIM(c.x_apellidocli)) AS nombre_cliente
       FROM ticket_super t
       JOIN ref_sucursal r    ON t.c_sucursal   = r.C_SUCURSAL
       JOIN cliente_clubuaa c ON t.n_codcliente = c.c_cliente
       WHERE t.c_idticket IN (${placeholders})
         AND t.fh_ticket >= '2026-06-01'`,
      ticketIds
    );
    return rows;
  } catch {
    return [];
  }
}

/* ─── Metric helpers ─── */
function calcMetrics(rows: EnrichedRow[]) {
  let promotores = 0, pasivos = 0, detractores = 0;
  let sumExp = 0, sumProd = 0, sumPrec = 0, sumAten = 0;
  let cntExp = 0, cntProd = 0, cntPrec = 0, cntAten = 0;

  for (const r of rows) {
    if (r.clasificacion === 'promotor')  promotores++;
    else if (r.clasificacion === 'pasivo') pasivos++;
    else if (r.clasificacion === 'detractor') detractores++;

    if (r.score_experiencia) { sumExp  += r.score_experiencia; cntExp++;  }
    if (r.score_productos)   { sumProd += r.score_productos;   cntProd++; }
    if (r.score_precios)     { sumPrec += r.score_precios;     cntPrec++; }
    if (r.score_atencion)    { sumAten += r.score_atencion;    cntAten++; }
  }

  const total = rows.length;
  const nps   = total > 0 ? Math.round(((promotores - detractores) / total) * 100) : 0;
  const avg   = (s: number, c: number) => c > 0 ? Math.round((s / c) * 10) / 10 : null;

  return {
    total, promotores, pasivos, detractores, nps,
    avgExperiencia: avg(sumExp, cntExp),
    avgProductos:   avg(sumProd, cntProd),
    avgPrecios:     avg(sumPrec, cntPrec),
    avgAtencion:    avg(sumAten, cntAten),
  };
}

function calcAspectos(rows: EnrichedRow[]) {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (!r.aspectos_mejorar) continue;
    for (const a of r.aspectos_mejorar.split(',')) {
      const t = a.trim();
      if (t) counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([aspecto, total]) => ({ aspecto, total }))
    .sort((a, b) => b.total - a.total);
}

function fmtDate(d: Date | string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d as string);
  return date.toLocaleString('es-AR', {
    timeZone: 'UTC',
    day: '2-digit', month: '2-digit', year: '2-digit',
    ...opts,
  });
}

/* ─── UI Components ─── */
function Gauge({ nps, promotores, pasivos, detractores }: {
  nps: number; promotores: number; pasivos: number; detractores: number;
}) {
  const cx = 130, cy = 148, R = 100, sw = 20;
  const clamped = Math.max(-100, Math.min(100, nps));
  const toRad = (d: number) => (d * Math.PI) / 180;
  const pt = (deg: number, r: number): [number, number] => [
    cx + r * Math.cos(toRad(deg)),
    cy - r * Math.sin(toRad(deg)),
  ];
  const arc = (fromDeg: number, toDeg: number, r: number) => {
    const [x1, y1] = pt(fromDeg, r);
    const [x2, y2] = pt(toDeg, r);
    const large = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const needleDeg = 180 - ((clamped + 100) / 200) * 180;
  const [nx, ny] = pt(needleDeg, R - 10);
  const zoneColor = nps >= 50 ? '#22c55e' : nps >= 0 ? '#f59e0b' : '#ef4444';
  const total = promotores + pasivos + detractores;
  const pctPro = total > 0 ? Math.round((promotores / total) * 100) : 0;
  const pctDet = total > 0 ? Math.round((detractores / total) * 100) : 0;
  const [lx, ly] = pt(180, R + sw + 6);
  const [mx, my] = pt(90,  R + sw + 6);
  const [rx, ry] = pt(0,   R + sw + 6);

  return (
    <div className="flex flex-col items-center">
      <svg width={260} height={168} viewBox="0 0 260 168">
        <path d={arc(180, 90, R)} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="butt" opacity={0.18} />
        <path d={arc(90,  45, R)} fill="none" stroke="#f59e0b" strokeWidth={sw} strokeLinecap="butt" opacity={0.18} />
        <path d={arc(45,   0, R)} fill="none" stroke="#22c55e" strokeWidth={sw} strokeLinecap="butt" opacity={0.18} />
        {total > 0 && (
          <path d={arc(180, needleDeg, R)} fill="none" stroke={zoneColor}
                strokeWidth={sw} strokeLinecap="round" opacity={0.85} />
        )}
        {[90, 45].map(deg => {
          const [tx1, ty1] = pt(deg, R - sw / 2 - 2);
          const [tx2, ty2] = pt(deg, R + sw / 2 + 2);
          return <line key={deg} x1={tx1.toFixed(2)} y1={ty1.toFixed(2)}
                       x2={tx2.toFixed(2)} y2={ty2.toFixed(2)} stroke="white" strokeWidth={2} />;
        })}
        <line x1={cx} y1={cy} x2={nx.toFixed(2)} y2={ny.toFixed(2)}
              stroke={UAA_PURPLE} strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={7} fill={UAA_PURPLE} />
        <circle cx={cx} cy={cy} r={3} fill="white" />
        <text x={lx.toFixed(2)} y={(ly + 4).toFixed(2)} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="sans-serif">−100</text>
        <text x={mx.toFixed(2)} y={(my - 4).toFixed(2)} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="sans-serif">0</text>
        <text x={rx.toFixed(2)} y={(ry + 4).toFixed(2)} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="sans-serif">+100</text>
        {total > 0 ? (
          <>
            <text x={cx} y={cy - 28} textAnchor="middle" fontSize={30} fontWeight="bold" fill={zoneColor} fontFamily="sans-serif">
              {nps > 0 ? `+${nps}` : nps}
            </text>
            <text x={cx} y={cy - 10} textAnchor="middle" fontSize={9.5} fill="#9ca3af" fontFamily="sans-serif">
              % promotores − % detractores
            </text>
          </>
        ) : (
          <text x={cx} y={cy - 20} textAnchor="middle" fontSize={13} fill="#d1d5db" fontFamily="sans-serif">Sin datos</text>
        )}
      </svg>
      {total > 0 && (
        <div className="flex gap-3 text-xs mt-1 flex-wrap justify-center">
          <span className="flex items-center gap-1 font-semibold text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            {promotores} promotores ({pctPro}%)
          </span>
          <span className="flex items-center gap-1 text-yellow-600">
            <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
            {pasivos} pasivos
          </span>
          <span className="flex items-center gap-1 text-red-500">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            {detractores} detractores ({pctDet}%)
          </span>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${(v / 5) * 100}%`, background: UAA_PURPLE }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{v > 0 ? v : '—'}</span>
    </div>
  );
}

function AspectoBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const isConforme = label.toLowerCase().includes('conforme');
  const color = isConforme ? '#22c55e' : UAA_PURPLE;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 w-56 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-8 text-right" style={{ color }}>{value}</span>
    </div>
  );
}

function Badge({ c }: { c: string }) {
  const map: Record<string, string> = {
    promotor:  'bg-green-100 text-green-700',
    pasivo:    'bg-yellow-100 text-yellow-700',
    detractor: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[c] ?? 'bg-gray-100 text-gray-600'}`}>
      {c}
    </span>
  );
}

function Stars({ n }: { n: number }) {
  return <span className="text-amber-400 text-sm">{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>;
}

/* ─── Page ─── */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sucursal?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('nps_session')?.value;
  const email = token ? verifySession(token) : null;
  if (!email) redirect('/dashboard/login');

  const params      = await searchParams;
  const activeTab   = params.tab === 'comentarios' ? 'comentarios' : 'resumen';
  const sucursalFilter = params.sucursal ?? '';

  /* Fetch all responses from SQL Server */
  const responses = await getAllResponses();

  /* Fetch MySQL enrichment for real ticket IDs */
  const realTicketIds = [...new Set(
    responses.filter(r => r.ticket_id > 0).map(r => r.ticket_id)
  )];
  const mysqlData = await getMySQLData(realTicketIds);
  const mysqlMap  = new Map(mysqlData.map(m => [m.ticket_id, m]));

  /* Enrich */
  const enriched: EnrichedRow[] = responses.map(r => ({
    ...r,
    ...(r.ticket_id > 0 ? mysqlMap.get(r.ticket_id) : {}),
  }));

  /* Sucursal list (from what actually has data) */
  const sucursales = Array.from(
    new Map(
      mysqlData
        .filter(m => m.c_sucursal && m.sucursal_nombre)
        .map(m => [m.c_sucursal, { code: m.c_sucursal, name: m.sucursal_nombre }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  /* Filter by sucursal */
  const filtered = sucursalFilter
    ? enriched.filter(r => r.c_sucursal === sucursalFilter)
    : enriched;

  /* Metrics */
  const { total, promotores, pasivos, detractores, nps,
          avgExperiencia, avgProductos, avgPrecios, avgAtencion } = calcMetrics(filtered);
  const aspectos   = calcAspectos(filtered);
  const maxAspecto = aspectos.length > 0 ? aspectos[0].total : 1;
  const recientes  = filtered.slice(0, 10);

  /* Comments tab */
  const comentarios = filtered.filter(r => r.comentario && r.comentario.trim());

  /* URL builder */
  function tabUrl(tab: string) {
    const p = new URLSearchParams();
    if (tab !== 'resumen') p.set('tab', tab);
    if (sucursalFilter) p.set('sucursal', sucursalFilter);
    return `/dashboard${p.size > 0 ? '?' + p.toString() : ''}`;
  }

  const sucursalLabel = sucursalFilter
    ? (sucursales.find(s => s.code === sucursalFilter)?.name ?? sucursalFilter)
    : null;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="w-full py-4 px-6 flex items-center justify-between shadow" style={{ background: UAA_PURPLE }}>
        <div className="flex items-center gap-4">
          <Image src="/logo-clubuaa.png" alt="Club UAA" width={120} height={44} style={{ objectFit: 'contain' }} />
          <div className="ml-1">
            <h1 className="text-white font-bold text-lg leading-tight">Dashboard NPS</h1>
            <p className="text-purple-300 text-xs">
              {sucursalLabel ? `Sucursal: ${sucursalLabel}` : 'Todas las sucursales'} · auto-refresh 30 s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-purple-200 text-xs hidden sm:inline">{email}</span>
          <AutoRefresh intervalMs={30000} />
          <LogoutButton />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Toolbar: tabs + sucursal filter */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex rounded-xl bg-white shadow-sm border border-gray-200 p-1 gap-1">
            <a
              href={tabUrl('resumen')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'resumen'
                  ? 'text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={activeTab === 'resumen' ? { background: UAA_PURPLE } : {}}
            >
              Resumen
            </a>
            <a
              href={tabUrl('comentarios')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'comentarios'
                  ? 'text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={activeTab === 'comentarios' ? { background: UAA_PURPLE } : {}}
            >
              Comentarios
              {comentarios.length > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
                  style={
                    activeTab === 'comentarios'
                      ? { background: 'rgba(255,255,255,0.25)', color: 'white' }
                      : { background: UAA_LIGHT, color: UAA_PURPLE }
                  }
                >
                  {comentarios.length}
                </span>
              )}
            </a>
          </div>

          <SucursalFilter sucursales={sucursales} current={sucursalFilter} activeTab={activeTab} />
        </div>

        {activeTab === 'resumen' ? (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total respuestas', value: total,       color: UAA_PURPLE },
                { label: 'Promotores',        value: promotores,  color: '#22c55e'  },
                { label: 'Pasivos',           value: pasivos,     color: '#f59e0b'  },
                { label: 'Detractores',       value: detractores, color: '#ef4444'  },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                  <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* Gauge + Score bars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 flex flex-col">
                <div className="flex items-baseline gap-2 mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">NPS Score</h2>
                  <span className="text-xs text-gray-400">% promotores − % detractores</span>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <Gauge nps={nps} promotores={promotores} pasivos={pasivos} detractores={detractores} />
                </div>
                <div className="mt-4 pt-4 border-t border-gray-50 grid grid-cols-3 text-center text-xs">
                  {[
                    { dot: 'bg-red-400',    label: 'Detractor', stars: '1–2 ★', color: 'text-red-500'    },
                    { dot: 'bg-yellow-400', label: 'Pasivo',    stars: '3 ★',   color: 'text-yellow-500' },
                    { dot: 'bg-green-500',  label: 'Promotor',  stars: '4–5 ★', color: 'text-green-600'  },
                  ].map(z => (
                    <div key={z.label}>
                      <div className={`w-3 h-3 rounded-full ${z.dot} mx-auto mb-1`} />
                      <span className="text-gray-500">{z.label}</span>
                      <p className={`font-bold ${z.color}`}>{z.stars}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700 mb-5">
                  Promedios por dimensión <span className="text-gray-400 font-normal">(sobre 5)</span>
                </h2>
                <div className="space-y-4">
                  <ScoreBar label="Experiencia" value={avgExperiencia} />
                  <ScoreBar label="Productos"   value={avgProductos}   />
                  <ScoreBar label="Precios"     value={avgPrecios}     />
                  <ScoreBar label="Atención"    value={avgAtencion}    />
                </div>
              </div>
            </div>

            {/* Aspectos */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-5">
                Aspectos por mejorar
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  {aspectos.length} opciones · por frecuencia
                </span>
              </h2>
              {aspectos.length === 0 ? (
                <p className="text-sm text-gray-400">Sin datos aún</p>
              ) : (
                <div className="space-y-3">
                  {aspectos.map(a => (
                    <AspectoBar key={a.aspecto} label={a.aspecto} value={a.total} max={maxAspecto} />
                  ))}
                </div>
              )}
            </div>

            {/* Últimas respuestas */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Últimas 10 respuestas</h2>
              </div>
              {recientes.length === 0 ? (
                <p className="px-6 py-8 text-sm text-gray-400 text-center">Sin respuestas aún</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {recientes.map((row, i) => (
                    <div key={i} className="px-6 py-3 flex items-start gap-4">
                      <Stars n={row.score} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <Badge c={row.clasificacion} />
                          {row.sucursal_nombre && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ background: UAA_LIGHT, color: UAA_PURPLE }}
                            >
                              {row.sucursal_nombre}
                            </span>
                          )}
                          {row.cliente_id === 0 && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">demo</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
                          <span>
                            Respuesta: {fmtDate(row.respondido_at, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {row.fecha_compra && (
                            <span>
                              Compra: {fmtDate(row.fecha_compra)}{row.hora_compra ? ` ${row.hora_compra}` : ''}
                            </span>
                          )}
                        </div>
                        {row.comentario && (
                          <p className="text-xs text-gray-500 truncate mt-0.5">{row.comentario}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* ─── Comentarios tab ─── */
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                Comentarios
                <span className="ml-2 text-xs text-gray-400 font-normal">{comentarios.length} respuestas</span>
              </h2>
            </div>
            {comentarios.length === 0 ? (
              <p className="px-6 py-8 text-sm text-gray-400 text-center">Sin comentarios aún</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left">
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 w-36">Cliente</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 w-36">Sucursal</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 w-28">Compra</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 w-28">Respuesta</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 w-24">Score</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500">Comentario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {comentarios.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-700 align-top">
                          {row.nombre_cliente ? (
                            <span className="font-medium">{row.nombre_cliente}</span>
                          ) : row.cliente_id === 0 ? (
                            <span className="text-gray-400 italic">Demo</span>
                          ) : (
                            <span className="text-gray-400">ID {row.cliente_id}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {row.sucursal_nombre ? (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                              style={{ background: UAA_LIGHT, color: UAA_PURPLE }}
                            >
                              {row.sucursal_nombre}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 align-top whitespace-nowrap">
                          {row.fecha_compra ? (
                            <>
                              <div>{fmtDate(row.fecha_compra)}</div>
                              {row.hora_compra && (
                                <div className="text-gray-400">{row.hora_compra}</div>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 align-top whitespace-nowrap">
                          {fmtDate(row.respondido_at, { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-0.5">
                            <Stars n={row.score} />
                            <Badge c={row.clasificacion} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 align-top leading-relaxed max-w-xs">
                          {row.comentario}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
