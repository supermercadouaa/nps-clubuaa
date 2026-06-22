export const dynamic = 'force-dynamic';

import Image from 'next/image';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { getPool } from '@/lib/mssql';
import AutoRefresh from './AutoRefresh';
import LogoutButton from './LogoutButton';

const UAA_PURPLE = '#3b1f8c';
const UAA_LIGHT  = '#f3f0ff';

async function getMetrics() {
  const pool = await getPool();

  const summary = await pool.request().query(`
    SELECT
      COUNT(*)                                                          AS total,
      SUM(CASE WHEN clasificacion = 'promotor'  THEN 1 ELSE 0 END)    AS promotores,
      SUM(CASE WHEN clasificacion = 'pasivo'    THEN 1 ELSE 0 END)    AS pasivos,
      SUM(CASE WHEN clasificacion = 'detractor' THEN 1 ELSE 0 END)    AS detractores,
      ROUND(AVG(CAST(score_experiencia AS FLOAT)), 1)                  AS avg_experiencia,
      ROUND(AVG(CAST(score_productos   AS FLOAT)), 1)                  AS avg_productos,
      ROUND(AVG(CAST(score_precios     AS FLOAT)), 1)                  AS avg_precios,
      ROUND(AVG(CAST(score_atencion    AS FLOAT)), 1)                  AS avg_atencion
    FROM nps_respuestas
  `);

  const aspectos = await pool.request().query(`
    SELECT LTRIM(RTRIM(value)) AS aspecto, COUNT(*) AS total
    FROM nps_respuestas
    CROSS APPLY STRING_SPLIT(aspectos_mejorar, ',')
    WHERE aspectos_mejorar IS NOT NULL
      AND LTRIM(RTRIM(value)) != ''
    GROUP BY LTRIM(RTRIM(value))
    ORDER BY total DESC
  `);

  const recientes = await pool.request().query(`
    SELECT TOP 10 score, clasificacion, comentario, canal, cliente_id, respondido_at
    FROM nps_respuestas
    ORDER BY respondido_at DESC
  `);

  return {
    s: summary.recordset[0],
    aspectos: aspectos.recordset,
    recientes: recientes.recordset,
  };
}

/* ─────────────────────────────────────────
   Velocímetro / Gauge NPS
   Semicírculo de 180° (izq) a 0° (der)
   Zonas: rojo -100→0 | amarillo 0→50 | verde 50→100
───────────────────────────────────────── */
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

  /* sweep=1 (clockwise en SVG) → arco va por ARRIBA del centro */
  const arc = (fromDeg: number, toDeg: number, r: number) => {
    const [x1, y1] = pt(fromDeg, r);
    const [x2, y2] = pt(toDeg, r);
    const large = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  /* needle angle: NPS −100 → 180°, NPS 0 → 90°, NPS +100 → 0° */
  const needleDeg = 180 - ((clamped + 100) / 200) * 180;
  const [nx, ny] = pt(needleDeg, R - 10);

  const zoneColor = nps >= 50 ? '#22c55e' : nps >= 0 ? '#f59e0b' : '#ef4444';
  const total = promotores + pasivos + detractores;
  const pctPro = total > 0 ? Math.round((promotores / total) * 100) : 0;
  const pctDet = total > 0 ? Math.round((detractores / total) * 100) : 0;

  /* label positions */
  const [lx, ly] = pt(180, R + sw + 6);
  const [mx, my] = pt(90,  R + sw + 6);
  const [rx, ry] = pt(0,   R + sw + 6);

  return (
    <div className="flex flex-col items-center">
      <svg width={260} height={168} viewBox="0 0 260 168">

        {/* Zone tracks (dim) */}
        <path d={arc(180, 90, R)} fill="none" stroke="#ef4444" strokeWidth={sw} strokeLinecap="butt" opacity={0.18} />
        <path d={arc(90,  45, R)} fill="none" stroke="#f59e0b" strokeWidth={sw} strokeLinecap="butt" opacity={0.18} />
        <path d={arc(45,   0, R)} fill="none" stroke="#22c55e" strokeWidth={sw} strokeLinecap="butt" opacity={0.18} />

        {/* Active zone highlight */}
        {total > 0 && (
          <path
            d={arc(180, needleDeg, R)}
            fill="none"
            stroke={zoneColor}
            strokeWidth={sw}
            strokeLinecap="round"
            opacity={0.85}
          />
        )}

        {/* Zone boundary ticks */}
        {[90, 45].map(deg => {
          const [tx1, ty1] = pt(deg, R - sw / 2 - 2);
          const [tx2, ty2] = pt(deg, R + sw / 2 + 2);
          return (
            <line key={deg} x1={tx1.toFixed(2)} y1={ty1.toFixed(2)}
                  x2={tx2.toFixed(2)} y2={ty2.toFixed(2)}
                  stroke="white" strokeWidth={2} />
          );
        })}

        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx.toFixed(2)} y2={ny.toFixed(2)}
              stroke={UAA_PURPLE} strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={7} fill={UAA_PURPLE} />
        <circle cx={cx} cy={cy} r={3} fill="white" />

        {/* Scale labels */}
        <text x={lx.toFixed(2)} y={(ly + 4).toFixed(2)} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="sans-serif">−100</text>
        <text x={mx.toFixed(2)} y={(my - 4).toFixed(2)} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="sans-serif">0</text>
        <text x={rx.toFixed(2)} y={(ry + 4).toFixed(2)} textAnchor="middle" fontSize={10} fill="#9ca3af" fontFamily="sans-serif">+100</text>

        {/* NPS value */}
        {total > 0 ? (
          <>
            <text x={cx} y={cy - 28} textAnchor="middle" fontSize={30} fontWeight="bold"
                  fill={zoneColor} fontFamily="sans-serif">
              {nps > 0 ? `+${nps}` : nps}
            </text>
            <text x={cx} y={cy - 10} textAnchor="middle" fontSize={9.5} fill="#9ca3af" fontFamily="sans-serif">
              % promotores − % detractores
            </text>
          </>
        ) : (
          <text x={cx} y={cy - 20} textAnchor="middle" fontSize={13} fill="#d1d5db" fontFamily="sans-serif">
            Sin datos
          </text>
        )}
      </svg>

      {/* Pills */}
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

/* ── Score bar ── */
function ScoreBar({ label, value }: { label: string; value: number | string | null }) {
  const v = value == null ? 0 : typeof value === 'string' ? parseFloat(value) : value;
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

/* ── Aspecto bar ── */
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

type Row = { score: number; clasificacion: string; comentario: string | null; canal: string; cliente_id: number; respondido_at: string };
type Aspecto = { aspecto: string; total: number };

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nps_session')?.value;
  const email = token ? verifySession(token) : null;
  if (!email) redirect('/dashboard/login');

  const { s, aspectos, recientes } = await getMetrics();

  const total       = s.total       ?? 0;
  const promotores  = s.promotores  ?? 0;
  const pasivos     = s.pasivos     ?? 0;
  const detractores = s.detractores ?? 0;
  const nps = total > 0 ? Math.round(((promotores - detractores) / total) * 100) : 0;
  const maxAspecto  = aspectos.length > 0 ? (aspectos as Aspecto[])[0].total : 1;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="w-full py-4 px-6 flex items-center justify-between shadow" style={{ background: UAA_PURPLE }}>
        <div className="flex items-center gap-4">
          <Image src="/logo-clubuaa.png" alt="Club UAA" width={120} height={44} style={{ objectFit: 'contain' }} />
          <div className="ml-1">
            <h1 className="text-white font-bold text-lg leading-tight">Dashboard NPS</h1>
            <p className="text-purple-300 text-xs">nps_respuestas · auto-refresh 30 s</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-purple-200 text-xs hidden sm:inline">{email}</span>
          <AutoRefresh intervalMs={30000} />
          <LogoutButton />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* KPI cards (4) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total respuestas', value: total,       color: UAA_PURPLE },
            { label: 'Promotores',       value: promotores,  color: '#22c55e'  },
            { label: 'Pasivos',          value: pasivos,     color: '#f59e0b'  },
            { label: 'Detractores',      value: detractores, color: '#ef4444'  },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">{c.label}</p>
              <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Gauge + Score bars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Velocímetro */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 flex flex-col">
            <div className="flex items-baseline gap-2 mb-4">
              <h2 className="text-sm font-semibold text-gray-700">NPS Score</h2>
              <span className="text-xs text-gray-400">% promotores − % detractores</span>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <Gauge nps={nps} promotores={promotores} pasivos={pasivos} detractores={detractores} />
            </div>
            <div className="mt-4 pt-4 border-t border-gray-50 grid grid-cols-3 text-center text-xs">
              <div>
                <div className="w-3 h-3 rounded-full bg-red-400 mx-auto mb-1" />
                <span className="text-gray-500">Detractor</span>
                <p className="font-bold text-red-500">1–2 ★</p>
              </div>
              <div>
                <div className="w-3 h-3 rounded-full bg-yellow-400 mx-auto mb-1" />
                <span className="text-gray-500">Pasivo</span>
                <p className="font-bold text-yellow-500">3 ★</p>
              </div>
              <div>
                <div className="w-3 h-3 rounded-full bg-green-500 mx-auto mb-1" />
                <span className="text-gray-500">Promotor</span>
                <p className="font-bold text-green-600">4–5 ★</p>
              </div>
            </div>
          </div>

          {/* Score bars */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-5">
              Promedios por dimensión <span className="text-gray-400 font-normal">(sobre 5)</span>
            </h2>
            <div className="space-y-4">
              <ScoreBar label="Experiencia" value={s.avg_experiencia} />
              <ScoreBar label="Productos"   value={s.avg_productos}   />
              <ScoreBar label="Precios"     value={s.avg_precios}     />
              <ScoreBar label="Atención"    value={s.avg_atencion}    />
            </div>
          </div>
        </div>

        {/* Aspectos por mejorar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-5">
            Aspectos por mejorar
            <span className="ml-2 text-xs text-gray-400 font-normal">
              {aspectos.length} opciones · ordenadas por frecuencia
            </span>
          </h2>
          {aspectos.length === 0 ? (
            <p className="text-sm text-gray-400">Sin datos aún</p>
          ) : (
            <div className="space-y-3">
              {(aspectos as Aspecto[]).map(a => (
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
              {(recientes as Row[]).map((row, i) => (
                <div key={i} className="px-6 py-3 flex items-start gap-4">
                  <Stars n={row.score} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <Badge c={row.clasificacion} />
                      {row.cliente_id === 0 && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">demo</span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(row.respondido_at).toLocaleString('es-AR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {row.comentario && (
                      <p className="text-xs text-gray-500 truncate">{row.comentario}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
