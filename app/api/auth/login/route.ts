import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import { getUserByEmail, verifyPassword } from '@/lib/usuarios';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

const DENY = NextResponse.json({ error: 'credenciales_invalidas' }, { status: 401 });

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 });
  }

  let email: string, password: string;
  try {
    ({ email, password } = await req.json());
  } catch {
    return DENY;
  }

  const emailNorm = (email ?? '').toLowerCase().trim();
  const user = await getUserByEmail(emailNorm);
  if (!user || !user.activo) return DENY;
  if (!verifyPassword(password ?? '', user.passwordHash)) return DENY;

  try {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO nps_dashboard_logs (email, accion, ip) VALUES ($1, 'login', $2)`,
        [emailNorm, ip]
      );
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[login log]', e);
  }

  const token = createSession(emailNorm);
  const res = NextResponse.json({ ok: true });
  res.cookies.set('nps_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 8 * 3600,
    path: '/',
  });
  return res;
}
