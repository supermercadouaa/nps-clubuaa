export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { verifySession } from '@/lib/auth';
import { listUsers } from '@/lib/usuarios';
import mysqlPool from '@/lib/mysql';
import AdminClient from './AdminClient';

const ADMIN_EMAIL = 'vmalmiron@uaa.com.ar';

function normCode(raw: string | null | undefined): string {
  if (raw == null) return '';
  return String(raw).trim().replace(/^0+/, '') || '0';
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nps_session')?.value;
  const email = token ? verifySession(token) : null;
  if (!email) redirect('/dashboard/login');
  if (email !== ADMIN_EMAIL) redirect('/dashboard');

  const [users, [sucursalRows]] = await Promise.all([
    listUsers(),
    mysqlPool.query<RowDataPacket[]>(
      `SELECT CAST(C_SUCURSAL AS CHAR) AS code, X_SUCURSAL AS name FROM ref_sucursal ORDER BY X_SUCURSAL`
    ),
  ]);

  const sucursales = (sucursalRows as RowDataPacket[]).map(r => ({
    code: normCode(String(r.code)),
    name: String(r.name).trim(),
  }));

  return <AdminClient users={users} currentEmail={email} sucursales={sucursales} />;
}
