import Image from 'next/image';
import { Pool } from 'pg';
import AutoRefresh from './AutoRefresh';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const UAA_PURPLE = '#3b1f8c';
const UAA_LIGHT  = '#f3f0ff';

async function getMetrics() {
  const client = await pool.connect();
  try {
    const summary = await client.query(`
      SELECT
        COUNT(*)::int                                                               AS total,
        SUM(CASE WHEN clasificacion = 'promotor'  THEN 1 ELSE 0 END)::int         AS promotores,
        SUM(CASE WHEN clasificacion = 'pasivo'    THEN 1 ELSE 0 END)::int         AS pasivos,
        SUM(CASE WHEN clasificacion = 'detractor' THEN 1 ELSE 0 END)::int         AS detractores,
        ROUND(AVG(score_experiencia)::numeric, 1)                                  AS avg_experiencia,
        ROUND(AVG(score_productos)::numeric,   1)                                  AS avg_productos,
        ROUND(AVG(score_precios)::numeric,     1)                                  AS avg_precios,
        ROUND(AVG(score_atencion)::numeric,    1)                                  AS avg_atencion
      FROM nps_respuestas
    `);

    const aspectos = await client.query(`
      SELECT aspecto, COUNT(*)::int AS total
      FROM (
        SELECT TRIM(UNNEST(STRING_TO_ARRAY(aspectos_mejorar, ','))) AS aspecto
        FROM nps_respuestas
        WHERE aspectos_mejorar IS NOT NULL
      ) t
      WHERE aspecto != ''
      GROUP BY aspecto
      ORDER BY total DESC
    `);

    const recientes = await client.query(`
      SELECT score, clasificacion, comentario, canal, cliente_id, respondido_at
      FROM nps_respuestas
      ORDER BY respondido_at DESC
      LIMIT 10
    `);

    return { s: summary.rows[0], aspectos: aspectos.rows, recientes: recientes.rows };
  } finally {
    client.release();
  }
}

/* ── Donut SVG ── */
function DonutChart({ promotores, pasivos, detractores }: {
  promotores: number; pasivos: number; detractores: number;
}) {
  const total = promotores + pasivos + detractores;
  if (total === 0) {
    return <div className="flex items-center justify-center h-52 text-sm text-gray-400">Sin respuestas aún</div>;
  }

  const cx = 100, cy = 100, R = 78, r = 50;
  const segs = [
    { value: promotores,  color: '#22c55e', label: 'Promotores'  },
    { value: pasivos,     color: '#f59e0b', label: 'Pasivos'     },
    { value: detractores, color: '#ef4444', label: 'Detractores' },
  ];

  let start = -Math.PI / 2;
  const paths: React.ReactElement[] = [];

  for (const s of segs) {
    if (s.value === 0) continue;
    const ang = (s.value / total) * 2 * Math.PI;
    const end = start + ang;
    const [x1, y1] = [cx + R * Math.cos(start), cy + R * Math.sin(start)];
    const [x2, y2] = [cx + R * Math.cos(end),   cy + R * Math.sin(end)];
    const [ix1,iy1]= [cx + r * Math.cos(start), cy + r * Math.sin(start)];
    const [ix2,iy2]= [cx + r * Math.cos(end),   cy + r * Math.sin(end)];
    const lg = ang > Math.PI ? 1 : 0;
    paths.push(
      <path key={s.label}
        d={`M ${x1} ${y1} A ${R} ${R} 0 ${lg} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${lg} 0 ${ix1} ${iy1} Z`}
        fill={s.color}
      />
    );
    start = end;
  }

  const nps = Math.round(((promotores - detractores) / total) * 100);

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={200} height={200} viewBox="0 0 200 200">
        {paths}
        <text x={100} y={94}  textAnchor="middle" fontSize={13} fill="#9ca3af" fontFamily="sans-serif">NPS</text>
        <text x={100} y={114} textAnchor="middle" fontSize={24} fontWeight="bold" fill={UAA_PURPLE} fontFamily="sans-serif">
          {nps > 0 ? `+${nps}` : nps}
        </text>
      </svg>
      <div className="flex gap-5 flex-wrap justify-center">
        {segs.map(s => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-gray-500">{s.label}</span>
            <span className="font-bold text-gray-800">{s.value}</span>
            <span className="text-gray-400">({Math.round((s.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
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

/* ── Aspectos bar ── */
function AspectoBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const isConforme = label.toLowerCase().includes('conforme');
  const color = isConforme ? '#22c55e' : UAA_PURPLE;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 w-52 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
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
  const { s, aspectos, recientes } = await getMetrics();

  const total      = s.total       ?? 0;
  const promotores = s.promotores  ?? 0;
  const pasivos    = s.pasivos     ?? 0;
  const detractores= s.detractores ?? 0;
  const nps        = total > 0 ? Math.round(((promotores - detractores) / total) * 100) : 0;

  const maxAspecto = aspectos.length > 0 ? (aspectos as Aspecto[])[0].total : 1;

  const cards = [
    { label: 'Total respuestas', value: total,       color: UAA_PURPLE },
    { label: 'Promotores',       value: promotores,  color: '#22c55e'  },
    { label: 'Pasivos',          value: pasivos,     color: '#f59e0b'  },
    { label: 'Detractores',      value: detractores, color: '#ef4444'  },
    {
      label: 'NPS Score',
      value: total > 0 ? (nps > 0 ? `+${nps}` : nps) : '—',
      color: nps >= 50 ? '#22c55e' : nps >= 0 ? '#f59e0b' : '#ef4444',
    },
  ];

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
        <AutoRefresh intervalMs={30000} />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {cards.map(c => (
            <div key={c.label} className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
              <p className="text-xs text-gray-400 mb-1">{c.label}</p>
              <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Donut + Scores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-5">Distribución de respuestas</h2>
            <DonutChart promotores={promotores} pasivos={pasivos} detractores={detractores} />
          </div>

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
              ({aspectos.length} opciones mencionadas)
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
