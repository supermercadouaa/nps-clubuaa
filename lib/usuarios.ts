import crypto from 'crypto';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ITER = 100000, KEYLEN = 32, DIGEST = 'sha256';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITER, KEYLEN, DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.pbkdf2Sync(password, salt, ITER, KEYLEN, DIGEST).toString('hex');
  const hashBuf    = Buffer.from(hash,    'hex');
  const derivedBuf = Buffer.from(derived, 'hex');
  if (hashBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, derivedBuf);
}

export type Usuario = {
  id: number;
  email: string;
  role: string;
  activo: boolean;
  created_at: string;
};

let tableReady = false;

export async function ensureTable(): Promise<void> {
  if (tableReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS nps_usuarios (
        id            SERIAL PRIMARY KEY,
        email         VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role          VARCHAR(20)  NOT NULL DEFAULT 'viewer',
        activo        BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
      )
    `);
    const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM nps_usuarios');
    if (Number(count) === 0) {
      // Passwords come from env vars so they're never in source code.
      // Set SEED_ADMIN_PASSWORD and SEED_DEFAULT_PASSWORD in Vercel before first deploy.
      const adminPwd   = process.env.SEED_ADMIN_PASSWORD;
      const defaultPwd = process.env.SEED_DEFAULT_PASSWORD;
      if (adminPwd && defaultPwd) {
        const seed = [
          { email: 'vmalmiron@uaa.com.ar',  password: adminPwd,   role: 'admin'  },
          { email: 'ndellarosa@uaa.com.ar',  password: defaultPwd, role: 'viewer' },
          { email: 'anbianchi@uaa.com.ar',   password: defaultPwd, role: 'viewer' },
          { email: 'amllandeka@uaa.com.ar',  password: defaultPwd, role: 'viewer' },
          { email: 'shsanchez@uaa.com.ar',   password: defaultPwd, role: 'viewer' },
          { email: 'jwvillalba@uaa.com.ar',  password: defaultPwd, role: 'viewer' },
        ];
        for (const u of seed) {
          try {
            await client.query(
              `INSERT INTO nps_usuarios (email, password_hash, role) VALUES ($1, $2, $3)`,
              [u.email, hashPassword(u.password), u.role]
            );
          } catch { /* race condition: another instance seeded first */ }
        }
      } else {
        console.warn('[nps_usuarios] SEED_ADMIN_PASSWORD / SEED_DEFAULT_PASSWORD no definidas — tabla vacía');
      }
    }
    tableReady = true;
  } finally {
    client.release();
  }
}

export async function getUserByEmail(
  email: string
): Promise<{ passwordHash: string; activo: boolean; role: string } | null> {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT password_hash, activo, role FROM nps_usuarios WHERE email = $1`,
    [email]
  );
  if (!rows[0]) return null;
  return { passwordHash: rows[0].password_hash, activo: rows[0].activo, role: rows[0].role };
}

export async function listUsers(): Promise<Usuario[]> {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT id, email, role, activo, created_at FROM nps_usuarios ORDER BY created_at`
  );
  return rows.map(r => ({
    id:         r.id,
    email:      r.email,
    role:       r.role,
    activo:     r.activo,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export async function createUser(email: string, password: string, role = 'viewer'): Promise<void> {
  await ensureTable();
  await pool.query(
    `INSERT INTO nps_usuarios (email, password_hash, role) VALUES ($1, $2, $3)`,
    [email.toLowerCase().trim(), hashPassword(password), role]
  );
}

export async function updatePassword(email: string, password: string): Promise<void> {
  await pool.query(
    `UPDATE nps_usuarios SET password_hash = $1 WHERE email = $2`,
    [hashPassword(password), email.toLowerCase().trim()]
  );
}

export async function setActivo(email: string, activo: boolean): Promise<void> {
  await pool.query(
    `UPDATE nps_usuarios SET activo = $1 WHERE email = $2`,
    [activo, email.toLowerCase().trim()]
  );
}

export async function deleteUser(email: string): Promise<void> {
  await pool.query(`DELETE FROM nps_usuarios WHERE email = $1`, [email.toLowerCase().trim()]);
}
