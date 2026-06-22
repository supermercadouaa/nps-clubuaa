import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('nps_session')?.value;
  const email = token ? verifySession(token) : null;

  if (email) {
    const client = await pool.connect();
    try {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
      await client.query(
        `INSERT INTO nps_dashboard_logs (email, accion, ip) VALUES ($1, 'logout', $2)`,
        [email, ip]
      );
    } finally {
      client.release();
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('nps_session', '', { maxAge: 0, path: '/' });
  return res;
}
