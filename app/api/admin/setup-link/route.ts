import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { createSetupToken } from '@/lib/usuarios';

const ADMIN_EMAIL = 'vmalmiron@uaa.com.ar';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('nps_session')?.value;
  if (!token || verifySession(token) !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400 });

  const setupToken = await createSetupToken(email);
  const origin = req.headers.get('origin') ?? 'https://encuesta.clubuaa.ar';
  return NextResponse.json({ link: `${origin}/activar?token=${setupToken}` });
}
