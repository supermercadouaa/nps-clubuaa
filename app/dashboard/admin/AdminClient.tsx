'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import LogoutButton from '@/app/dashboard/LogoutButton';

type Usuario = { id: number; email: string; role: string; activo: boolean; created_at: string };

const UAA_PURPLE = '#3b1f8c';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
}

export default function AdminClient({
  users: initial,
  currentEmail,
}: {
  users: Usuario[];
  currentEmail: string;
}) {
  const [users, setUsers]       = useState(initial);
  const [newEmail, setNewEmail] = useState('');
  const [newPwd, setNewPwd]     = useState('');
  const [newRole, setNewRole]   = useState('viewer');
  const [adding, setAdding]     = useState(false);
  const [addErr, setAddErr]     = useState('');
  const [editEmail, setEditEmail] = useState<string | null>(null);
  const [editPwd, setEditPwd]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState('');

  async function refresh() {
    const r = await fetch('/api/admin/usuarios');
    const d = await r.json();
    setUsers(d.users);
  }

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true); setAddErr('');
    const r = await fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, password: newPwd, role: newRole }),
    });
    if (r.ok) {
      setNewEmail(''); setNewPwd(''); setNewRole('viewer');
      await refresh();
      flash('Usuario creado correctamente');
    } else {
      const d = await r.json();
      setAddErr(d.error === 'email_duplicado' ? 'El email ya existe' : 'Error al crear usuario');
    }
    setAdding(false);
  }

  async function handleToggle(email: string, activo: boolean) {
    await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, activo: !activo }),
    });
    await refresh();
    flash(activo ? `${email} deshabilitado` : `${email} habilitado`);
  }

  async function handleDelete(email: string) {
    if (!confirm(`¿Eliminar el usuario ${email}? Esta acción no se puede deshacer.`)) return;
    await fetch('/api/admin/usuarios', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    await refresh();
    flash(`${email} eliminado`);
  }

  async function handleChangePwd(e: React.FormEvent) {
    e.preventDefault();
    if (!editEmail || !editPwd) return;
    setSaving(true);
    await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: editEmail, password: editPwd }),
    });
    setEditEmail(null); setEditPwd(''); setSaving(false);
    flash('Contraseña actualizada');
  }

  const inp = 'h-9 px-3 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <div className="min-h-screen bg-muted/30">

      {/* Header */}
      <div className="w-full py-3.5 px-6 flex items-center justify-between shadow-sm" style={{ background: UAA_PURPLE }}>
        <div className="flex items-center gap-4">
          <Image src="/logo-clubuaa.png" alt="Club UAA" width={110} height={40} style={{ objectFit: 'contain' }}/>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">Gestión de Usuarios</h1>
            <p className="text-purple-300 text-xs">Panel de administración · NPS Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-purple-300 text-xs hidden sm:inline">{currentEmail}</span>
          <Link
            href="/dashboard"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}
          >
            ← Dashboard
          </Link>
          <LogoutButton/>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Toast */}
        {toast && (
          <div className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-green-500 shadow-sm">
            {toast}
          </div>
        )}

        {/* Add user card */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-0 pt-5 px-6">
            <CardTitle className="text-sm font-semibold">Agregar usuario</CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-5 pt-4">
            <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Email</label>
                <input
                  className={`${inp} w-64`} type="email"
                  placeholder="usuario@uaa.com.ar"
                  value={newEmail} onChange={e => setNewEmail(e.target.value)} required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Contraseña</label>
                <input
                  className={`${inp} w-36`} type="text"
                  placeholder="Contraseña"
                  value={newPwd} onChange={e => setNewPwd(e.target.value)} required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Rol</label>
                <select className={`${inp} w-28`} value={newRole} onChange={e => setNewRole(e.target.value)}>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                type="submit" disabled={adding}
                className="h-9 px-4 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-opacity mb-0"
                style={{ background: UAA_PURPLE }}
              >
                {adding ? 'Agregando…' : '+ Agregar'}
              </button>
              {addErr && <span className="text-xs text-red-500 self-end">{addErr}</span>}
            </form>
          </CardContent>
        </Card>

        {/* Users table */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-0 pt-5 px-6">
            <CardTitle className="text-sm font-semibold">
              Usuarios
              <span className="ml-2 text-muted-foreground font-normal text-xs">
                {users.length} usuario{users.length !== 1 ? 's' : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0 pt-3">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 hover:bg-transparent">
                    <TableHead className="text-xs font-semibold pl-6 min-w-[220px]">Email</TableHead>
                    <TableHead className="text-xs font-semibold text-center w-24">Rol</TableHead>
                    <TableHead className="text-xs font-semibold text-center w-24">Estado</TableHead>
                    <TableHead className="text-xs font-semibold text-center w-28">Creado</TableHead>
                    <TableHead className="text-xs font-semibold text-center pr-6">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.email} className="border-border/30 hover:bg-muted/20">
                      <TableCell className="pl-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{u.email}</span>
                          {u.email === currentEmail && (
                            <Badge className="text-[10px] px-1.5 bg-primary/10 text-primary border-0 hover:bg-primary/10">Vos</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center py-3">
                        {u.role === 'admin'
                          ? <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-0 text-xs">Admin</Badge>
                          : <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 border-0 text-xs">Viewer</Badge>}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        {u.activo
                          ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0 text-xs">Activo</Badge>
                          : <Badge className="bg-red-100 text-red-600 hover:bg-red-100 border-0 text-xs">Inactivo</Badge>}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(u.created_at)}</span>
                      </TableCell>
                      <TableCell className="text-center py-3 pr-6">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => { setEditEmail(u.email); setEditPwd(''); }}
                            className="h-7 px-2.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
                          >
                            Contraseña
                          </button>
                          {u.email !== currentEmail && (
                            <>
                              <button
                                onClick={() => handleToggle(u.email, u.activo)}
                                className={`h-7 px-2.5 rounded-md text-xs font-medium border transition-colors ${
                                  u.activo
                                    ? 'border-orange-200 text-orange-600 hover:bg-orange-50'
                                    : 'border-green-200 text-green-600 hover:bg-green-50'
                                }`}
                              >
                                {u.activo ? 'Deshabilitar' : 'Habilitar'}
                              </button>
                              <button
                                onClick={() => handleDelete(u.email)}
                                className="h-7 px-2.5 rounded-md text-xs font-medium border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                              >
                                Eliminar
                              </button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Change password modal */}
      {editEmail && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setEditEmail(null)}
        >
          <Card className="shadow-2xl border-border w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <CardHeader className="pb-0 pt-5 px-6">
              <CardTitle className="text-sm font-semibold">Cambiar contraseña</CardTitle>
              <p className="text-xs text-muted-foreground mt-1 font-mono">{editEmail}</p>
            </CardHeader>
            <CardContent className="px-6 pb-6 pt-4">
              <form onSubmit={handleChangePwd} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Nueva contraseña</label>
                  <input
                    className={`${inp} w-full`}
                    type="text"
                    autoFocus
                    placeholder="Nueva contraseña"
                    value={editPwd}
                    onChange={e => setEditPwd(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 h-9 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                    style={{ background: UAA_PURPLE }}
                  >
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditEmail(null)}
                    className="flex-1 h-9 rounded-lg text-sm font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
