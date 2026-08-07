export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { listUsers } from '@/lib/usuarios';
import AdminClient from './AdminClient';

const ADMIN_EMAIL = 'vmalmiron@uaa.com.ar';

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nps_session')?.value;
  const email = token ? verifySession(token) : null;
  if (!email) redirect('/dashboard/login');
  if (email !== ADMIN_EMAIL) redirect('/dashboard');

  const users = await listUsers();
  return <AdminClient users={users} currentEmail={email} />;
}
