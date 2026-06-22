import crypto from 'crypto';

const SECRET = process.env.AUTH_SECRET ?? 'nps-uaa-dashboard-2026';
const SESSION_HOURS = 8;

export function createSession(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email, exp: Date.now() + SESSION_HOURS * 3600 * 1000 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token: string): string | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() > exp) return null;
    return email as string;
  } catch {
    return null;
  }
}
