import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { listUsers, createUser, updatePassword, setActivo, deleteUser, createSetupToken } from '@/lib/usuarios';

const ADMIN_EMAIL = 'vmalmiron@uaa.com.ar';

function getAdminEmail(req: NextRequest): string | null {
  const token = req.cookies.get('nps_session')?.value;
  if (!token) return null;
  const email = verifySession(token);
  if (email !== ADMIN_EMAIL) return null;
  return email;
}

const FORBIDDEN = NextResponse.json({ error: 'forbidden' }, { status: 403 });

export async function GET(req: NextRequest) {
  if (!getAdminEmail(req)) return FORBIDDEN;
  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  if (!getAdminEmail(req)) return FORBIDDEN;
  const { email, password, role } = await req.json();
  if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400 });
  try {
    await createUser(email, password ?? '', role ?? 'viewer');
    let setupLink: string | null = null;
    if (!password) {
      const setupToken = await createSetupToken(email);
      const origin = req.headers.get('origin') ?? 'https://encuesta.clubuaa.ar';
      setupLink = `${origin}/activar?token=${setupToken}`;
    }
    return NextResponse.json({ ok: true, setupLink });
  } catch (e: unknown) {
    const pg = e as { code?: string };
    if (pg?.code === '23505') {
      return NextResponse.json({ error: 'email_duplicado' }, { status: 409 });
    }
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  if (!getAdminEmail(req)) return FORBIDDEN;
  const { email, password, activo } = await req.json();
  if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400 });
  if (password !== undefined) await updatePassword(email, password);
  if (activo  !== undefined) await setActivo(email, activo);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!getAdminEmail(req)) return FORBIDDEN;
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400 });
  if (email === ADMIN_EMAIL) {
    return NextResponse.json({ error: 'no_puedes_eliminarte' }, { status: 400 });
  }
  await deleteUser(email);
  return NextResponse.json({ ok: true });
}
