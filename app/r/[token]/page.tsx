import { Pool } from 'pg';
import SurveyForm from './SurveyForm';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function validateToken(token: string) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT respondido, expira_at FROM nps_enviados WHERE token = $1`,
      [token]
    );
    if (result.rows.length === 0) return 'invalido';
    const row = result.rows[0];
    if (row.respondido) return 'ya_respondido';
    if (new Date(row.expira_at) < new Date()) return 'expirado';
    return 'ok';
  } finally {
    client.release();
  }
}

/* ── Pantallas de estado ── */
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div
        className="w-full max-w-sm rounded-3xl p-8 text-center"
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex flex-col items-center mb-6">
      <span className="text-white text-2xl font-light tracking-widest">Club</span>
      <span
        className="text-white text-3xl font-black tracking-widest px-5 py-1 rounded-full mt-1"
        style={{ background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)' }}
      >
        UAA
      </span>
    </div>
  );
}

/* ── Página principal (Server Component) ── */
export default async function Page({ params }: { params: { token: string } }) {
  const { token } = params;
  const status = await validateToken(token);

  if (status === 'invalido') {
    return (
      <Wrapper>
        <Logo />
        <div className="text-4xl mb-4">🔗</div>
        <h2 className="text-lg font-bold text-white mb-2">Link inválido</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Este link de encuesta no existe o es incorrecto.
        </p>
      </Wrapper>
    );
  }

  if (status === 'expirado') {
    return (
      <Wrapper>
        <Logo />
        <div className="text-4xl mb-4">⏰</div>
        <h2 className="text-lg font-bold text-white mb-2">Link expirado</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Los links de encuesta tienen vigencia de 7 días y este ya venció.
        </p>
      </Wrapper>
    );
  }

  if (status === 'ya_respondido') {
    return (
      <Wrapper>
        <Logo />
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-lg font-bold text-white mb-2">¡Ya respondiste!</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Ya registramos tu opinión. ¡Muchas gracias por ayudarnos a mejorar!
        </p>
      </Wrapper>
    );
  }

  return <SurveyForm token={token} />;
}
