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
    // Métricas de envíos desde nps_enviados
    const enviados = await client.query(`
      SELECT
        COUNT(*)::int                                          AS total,
        SUM(CASE WHEN abierto    = TRUE THEN 1 ELSE 0 END)::int AS abiertos,
        SUM(CASE WHEN respondido = TRUE THEN 1 ELSE 0 END)::int AS respondidos,
        SUM(CASE WHEN canal = 'whatsapp' THEN 1 ELSE 0 END)::int AS por_whatsapp,
        SUM(CASE WHEN canal = 'email'    THEN 1 ELSE 0 END)::int AS por_email
      FROM nps_enviados
    `);

    // Distribución NPS y scores desde nps_respuestas
    const respuestas = await client.query(`
      SELECT
        COUNT(*)::int                                                              AS total,
        SUM(CASE WHEN clasificacion = 'promotor'  THEN 1 ELSE 0 END)::int        AS promotores,
        SUM(CASE WHEN clasificacion = 'pasivo'    THEN 1 ELSE 0 END)::int        AS pasivos,
        SUM(CASE WHEN clasificacion = 'detractor' THEN 1 ELSE 0 END)::int        AS detractores,
        ROUND(AVG(score_experiencia)::numeric, 1)                                 AS avg_experiencia,
        ROUND(AVG(score_productos)::numeric,   1)                                 AS avg_productos,
        ROUND(AVG(score_precios)::numeric,     1)                                 AS avg_precios,
        ROUND(AVG(score_atencion)::numeric,    1)                                 AS avg_atencion
      FROM nps_respuestas
    `);

    // Últimas 10 respuestas
    const recientes = await client.query(`
      SELECT
        r.score,
        r.clasificacion,
        r.comentario,
        r.canal,
        r.cliente_id,
        r.respondido_at
      FROM nps_respuestas r
      ORDER BY r.respondido_at DESC
      LIMIT 10
    `);

    // Aspectos más mencionados
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
      LIMIT 6
    `);

    return {
      env: enviados.rows[0],
      res: respuestas.rows[0],
      recientes: recientes.rows,
      aspectos: aspectos.rows,
    };
  } finally {
    client.release();
  }
}

/* ── Donut SVG ── */
function DonutChart({
  promotores, pasivos, detractores,
}: { promotores: number; pasivos: number; detractores: number }) {
  const total = promotores + pasivos + detractores;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-sm text-gray-400">
        Sin respuestas aún
      </div>
    );
  }

  const cx = 100, cy = 100, R = 78, r = 50;
  const segs = [
    { value: promotores,  color: '#22c55e', label: 'Promotores'  },
    { value: pasivos,     color: '#f59e0b', label: 'Pasivos'     },
    { value: detractores, color: '#ef4444', label: 'Detractores' },
  ];

  let startAngle = -Math.PI / 2;
  const paths: React.ReactElement[] = [];

  for (const s of segs) {
    if (s.value === 0) continue;
    const angle = (s.value / total) * 2 * Math.PI;
    const end = startAngle + angle;
    const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(end),         y2 = cy + R * Math.sin(end);
    const ix1 = cx + r * Math.cos(startAngle), iy1 = cy + r * Math.sin(startAngle);
    const ix2 = cx + r * Math.cos(end),         iy2 = cy + r * Math.sin(end);
    const large = angle > Math.PI ? 1 : 0;
    paths.push(
      <path key={s.label}
        d={`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1} Z`}
        fill={s.color}
      />
    );
    startAngle = end;
  }

  const nps = Math.round(((promotores - detractores) / total) * 100);

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={200} height={200} viewBox="0 0 200 200">
        {paths}
        <text x={100} y={94}  textAnchor="middle" fontSize={13} fill="#6b7280" fontFamily="sans-serif">NPS</text>
        <text x={100} y={114} textAnchor="middle" fontSize={22} fontWeight="bold" fill={UAA_PURPLE} fontFamily="sans-serif">
          {nps > 0 ? `+${nps}` : nps}
        </text>
      </svg>
      <div className="flex gap-5 text-xs justify-center flex-wrap">
        {segs.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-gray-500">{s.label}</span>
            <span className="font-bold text-gray-800">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Bar de score ── */
function ScoreBar({ label, value }: { label: string; value: number | string | null }) {
  const v = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${(v / 5) * 100}%`, background: UAA_PURPLE }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{v > 0 ? v : '—'}</span>
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
  const { env: e, res: r, recientes, aspectos } = await getMetrics();

  const totalEnv   = e.total       ?? 0;
  const abiertos   = e.abiertos    ?? 0;
  const respondidos= e.respondidos ?? 0;
  const tasaAp     = totalEnv > 0 ? Math.round((abiertos    / totalEnv) * 100) : 0;
  const tasaResp   = totalEnv > 0 ? Math.round((respondidos / totalEnv) * 100) : 0;

  const promotores  = r.promotores  ?? 0;
  const pasivos     = r.pasivos     ?? 0;
  const detractores = r.detractores ?? 0;
  const totalResp   = r.total       ?? 0;
  const nps = totalResp > 0 ? Math.round(((promotores - detractores) / totalResp) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <AutoRefresh intervalMs={30000} />

      {/* Header */}
      <div className="w-full py-4 px-6 flex items-center gap-4 shadow" style={{ background: UAA_PURPLE }}>
        <Image src="/logo-clubuaa.png" alt="Club UAA" width={120} height={44} style={{ objectFit: 'contain' }} />
        <div className="ml-2">
          <h1 className="text-white font-bold text-lg leading-tight">Dashboard NPS</h1>
          <p className="text-purple-200 text-xs">Actualización automática cada 30 s</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* KPI cards — datos de nps_enviados */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Envíos · nps_enviados</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total enviados',     value: totalEnv,               sub: 'histórico',           color: UAA_PURPLE },
              { label: 'Abiertos',           value: abiertos,               sub: `${tasaAp}% apertura`, color: '#0ea5e9'  },
              { label: 'Respondidos',        value: respondidos,            sub: `${tasaResp}% de respuesta`, color: '#8b5cf6' },
              { label: 'NPS Score',          value: nps > 0 ? `+${nps}` : nps, sub: '−100 a +100',    color: nps >= 50 ? '#22c55e' : nps >= 0 ? '#f59e0b' : '#ef4444' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                <p className="text-3xl font-bold" style={{ color: c.color }}>{c.value}</p>
                <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Canal breakdown */}
        <div className="grid grid-cols-2 gap-4 md:max-w-sm">
          {[
            { label: 'Por WhatsApp', value: e.por_whatsapp ?? 0, color: '#22c55e' },
            { label: 'Por Email',    value: e.por_email    ?? 0, color: '#0ea5e9' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 flex items-center gap-3">
              <span className="w-3 h-3 rounded-full" style={{ background: c.color }} />
              <div>
                <p className="text-xs text-gray-400">{c.label}</p>
                <p className="text-xl font-bold text-gray-800">{c.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Donut + Scores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Distribución de respuestas</h2>
            <DonutChart promotores={promotores} pasivos={pasivos} detractores={detractores} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-5">
              Promedios por dimensión <span className="text-gray-400 font-normal">(sobre 5)</span>
            </h2>
            <div className="space-y-4">
              <ScoreBar label="Experiencia" value={r.avg_experiencia} />
              <ScoreBar label="Productos"   value={r.avg_productos}   />
              <ScoreBar label="Precios"     value={r.avg_precios}     />
              <ScoreBar label="Atención"    value={r.avg_atencion}    />
            </div>

            {aspectos.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-semibold text-gray-500 mb-2">Aspectos más mencionados</p>
                <div className="flex flex-wrap gap-2">
                  {(aspectos as Aspecto[]).map(a => (
                    <span key={a.aspecto} className="px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{ background: UAA_LIGHT, color: UAA_PURPLE }}>
                      {a.aspecto} <span className="font-bold">({a.total})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
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
                  <div className="shrink-0 pt-0.5">
                    <Stars n={row.score} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
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
