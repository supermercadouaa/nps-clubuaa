import Image from 'next/image';
import { getPool } from '@/lib/mssql';
import SurveyForm from './SurveyForm';

const UAA_PURPLE = '#3b1f8c';

async function validateToken(token: string) {
  const pool = await getPool();
  const result = await pool.request()
    .input('token', token)
    .query('SELECT respondido, expira_at FROM nps_enviados WHERE token = @token');
  if (result.recordset.length === 0) return 'invalido';
  const row = result.recordset[0];
  if (row.respondido) return 'ya_respondido';
  if (new Date(row.expira_at) < new Date()) return 'expirado';
  return 'ok';
}

/* ── Layout compartido para pantallas de estado ── */
function StatusPage({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-start py-8 px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div
          className="w-full flex justify-center items-center py-6 rounded-t-2xl"
          style={{ background: UAA_PURPLE }}
        >
          <Image src="/logo-clubuaa.png" alt="Club UAA" width={160} height={60} style={{ objectFit: 'contain' }} />
        </div>

        {/* Card */}
        <div className="rounded-b-2xl border border-t-0 border-gray-100 shadow-md p-8 text-center bg-white">
          <div className="text-5xl mb-4">{icon}</div>
          <h2 className="text-lg font-bold mb-2" style={{ color: UAA_PURPLE }}>{title}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Página principal ── */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  /* Tokens especiales de prueba — no consultan la base */
  if (token === 'test-invalido') {
    return (
      <StatusPage
        icon="🔗"
        title="Link inválido"
        message="Este link de encuesta no existe o es incorrecto."
      />
    );
  }

  if (token === 'test-respondido') {
    return (
      <StatusPage
        icon="✅"
        title="¡Ya respondiste!"
        message="Ya registramos tu opinión. ¡Muchas gracias por ayudarnos a mejorar!"
      />
    );
  }

  if (token === 'test-demo') {
    return <SurveyForm token="test-demo" demo={true} />;
  }

  if (token === 'test-demo-habilitado') {
    return <SurveyForm token="test-demo-habilitado" />;
  }

  /* Tokens reales — consultan SQL Server */
  const status = await validateToken(token);

  if (status === 'invalido') {
    return (
      <StatusPage
        icon="🔗"
        title="Link inválido"
        message="Este link de encuesta no existe o es incorrecto."
      />
    );
  }

  if (status === 'expirado') {
    return (
      <StatusPage
        icon="⏰"
        title="Link expirado"
        message="Los links de encuesta tienen vigencia de 7 días y este ya venció."
      />
    );
  }

  if (status === 'ya_respondido') {
    return (
      <StatusPage
        icon="✅"
        title="¡Ya respondiste!"
        message="Ya registramos tu opinión. ¡Muchas gracias por ayudarnos a mejorar!"
      />
    );
  }

  return <SurveyForm token={token} />;
}
