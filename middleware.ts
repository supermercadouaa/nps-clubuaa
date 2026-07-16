import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_EMAILS = new Set([
  'vmalmiron@uaa.com.ar',
  'ndellarosa@uaa.com.ar',
  'pdenrique@uaa.com.ar',
  'amllandeka@uaa.com.ar',
  'shsanchez@uaa.com.ar',
]);

function b64urlToBytes(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

async function verifyEdgeToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return false;

    const dot = token.lastIndexOf('.');
    if (dot === -1) return false;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(sig),
      new TextEncoder().encode(payload)
    );
    if (!valid) return false;

    const { email, exp } = JSON.parse(
      new TextDecoder().decode(b64urlToBytes(payload))
    );
    if (Date.now() > exp) return false;
    if (!ALLOWED_EMAILS.has(email)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/login')) {
    const token = req.cookies.get('nps_session')?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/dashboard/login', req.url));
    }
    const ok = await verifyEdgeToken(token);
    if (!ok) {
      const res = NextResponse.redirect(new URL('/dashboard/login', req.url));
      res.cookies.set('nps_session', '', { maxAge: 0, path: '/' });
      return res;
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};
