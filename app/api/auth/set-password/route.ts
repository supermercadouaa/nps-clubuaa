import { NextRequest, NextResponse } from 'next/server';
import { useSetupToken, activateUser } from '@/lib/usuarios';

export async function POST(req: NextRequest) {
  const { token, email, password } = await req.json();

  if (!password || String(password).length < 6) {
    return NextResponse.json({ error: 'minimo_6_caracteres' }, { status: 400 });
  }

  if (token) {
    // Token-based flow (legacy setup links)
    const ok = await useSetupToken(String(token), String(password));
    if (!ok) {
      return NextResponse.json({ error: 'link_invalido_o_expirado' }, { status: 400 });
    }
  } else if (email) {
    // First-login activation: sets password only if user has none yet
    const ok = await activateUser(String(email).toLowerCase().trim(), String(password));
    if (!ok) {
      return NextResponse.json({ error: 'no_aplica' }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: 'datos_requeridos' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
