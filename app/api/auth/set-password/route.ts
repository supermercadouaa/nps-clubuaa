import { NextRequest, NextResponse } from 'next/server';
import { useSetupToken } from '@/lib/usuarios';

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (!token || !password) {
    return NextResponse.json({ error: 'token y password requeridos' }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: 'minimo_6_caracteres' }, { status: 400 });
  }
  const ok = await useSetupToken(token, password);
  if (!ok) {
    return NextResponse.json({ error: 'link_invalido_o_expirado' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
