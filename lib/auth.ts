import crypto from 'crypto';

export const ALLOWED_EMAILS = new Set([
  'vmalmiron@uaa.com.ar',
  'ndellarosa@uaa.com.ar',
  'pdenrique@uaa.com.ar',
  'amllandeka@uaa.com.ar',
  'shsanchez@uaa.com.ar',
  'jwvillalba@uaa.com.ar',
]);

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET env var is not set');
  return s;
}

const SESSION_HOURS = 8;

export function isAllowed(email: string): boolean {
  return ALLOWED_EMAILS.has(email.toLowerCase().trim());
}

export function createSession(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email, exp: Date.now() + SESSION_HOURS * 3600 * 1000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token: string): string | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() > exp) return null;
    if (!ALLOWED_EMAILS.has(email)) return null;
    return email as string;
  } catch {
    return null;
  }
}
