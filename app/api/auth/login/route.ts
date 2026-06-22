import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email?.endsWith('@uaa.com.ar') || password !== 'Uaa2026') {
    return NextResponse.json({ error: 'credenciales_invalidas' }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS nps_dashboard_logs (
        id        SERIAL PRIMARY KEY,
        email     VARCHAR(100) NOT NULL,
        accion    VARCHAR(20)  NOT NULL,
        ip        VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    await client.query(
      `INSERT INTO nps_dashboard_logs (email, accion, ip) VALUES ($1, 'login', $2)`,
      [email, ip]
    );
  } finally {
    client.release();
  }

  const token = createSession(email);
  const res = NextResponse.json({ ok: true });
  res.cookies.set('nps_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 3600,
    path: '/',
  });
  return res;
}
