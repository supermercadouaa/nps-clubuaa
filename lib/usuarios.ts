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
  has_password: boolean;
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
        password_hash VARCHAR(255) NOT NULL DEFAULT '',
        role          VARCHAR(20)  NOT NULL DEFAULT 'viewer',
        activo        BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
      )
    `);
    // Idempotent migrations — run every cold start
    await client.query(`ALTER TABLE nps_usuarios ADD COLUMN IF NOT EXISTS setup_token VARCHAR(64)`);
    await client.query(`ALTER TABLE nps_usuarios ADD COLUMN IF NOT EXISTS setup_token_expires TIMESTAMP`);

    const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM nps_usuarios');
    if (Number(count) === 0) {
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
          } catch { /* race condition */ }
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
  // Empty hash = user created without password (activation pending) — can't log in
  if (!rows[0].password_hash) return null;
  return { passwordHash: rows[0].password_hash, activo: rows[0].activo, role: rows[0].role };
}

export async function listUsers(): Promise<Usuario[]> {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT id, email, role, activo, password_hash, created_at FROM nps_usuarios ORDER BY created_at`
  );
  return rows.map(r => ({
    id:           r.id,
    email:        r.email,
    role:         r.role,
    activo:       r.activo,
    has_password: Boolean(r.password_hash),
    created_at:   r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

// password is optional — if empty, user must activate via setup link
export async function createUser(email: string, password = '', role = 'viewer'): Promise<void> {
  await ensureTable();
  await pool.query(
    `INSERT INTO nps_usuarios (email, password_hash, role) VALUES ($1, $2, $3)`,
    [email.toLowerCase().trim(), password ? hashPassword(password) : '', role]
  );
}

export async function updatePassword(email: string, password: string): Promise<void> {
  await pool.query(
    `UPDATE nps_usuarios SET password_hash = $1, setup_token = NULL, setup_token_expires = NULL WHERE email = $2`,
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

// ── Activation tokens ────────────────────────────────────────────────────────

export async function createSetupToken(email: string): Promise<string> {
  await ensureTable();
  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 48 * 3600 * 1000); // 48 horas
  await pool.query(
    `UPDATE nps_usuarios SET setup_token = $1, setup_token_expires = $2 WHERE email = $3`,
    [token, expires, email.toLowerCase().trim()]
  );
  return token;
}

export async function validateSetupToken(token: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT email, setup_token_expires FROM nps_usuarios WHERE setup_token = $1 AND activo = TRUE`,
    [token]
  );
  if (!rows[0]) return null;
  if (new Date(rows[0].setup_token_expires) < new Date()) return null;
  return rows[0].email as string;
}

export async function useSetupToken(token: string, newPassword: string): Promise<boolean> {
  const email = await validateSetupToken(token);
  if (!email) return false;
  await pool.query(
    `UPDATE nps_usuarios
       SET password_hash = $1, setup_token = NULL, setup_token_expires = NULL
     WHERE email = $2`,
    [hashPassword(newPassword), email]
  );
  return true;
}
