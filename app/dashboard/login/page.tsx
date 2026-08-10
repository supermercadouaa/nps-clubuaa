'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const UAA_PURPLE = '#3b1f8c';

export default function LoginPage() {
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [mode, setMode]           = useState<'login' | 'activate'>('login');
  const [newPwd, setNewPwd]       = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 429) {
        setError('Demasiados intentos. Esperá 15 minutos antes de volver a intentar.');
        return;
      }
      if (!res.ok) {
        setError('Credenciales incorrectas.');
        return;
      }
      const data = await res.json();
      if (data.needs_activation) {
        setMode('activate');
      } else {
        router.push('/dashboard');
      }
    } catch {
      setError('Error de conexión. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: newPwd }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error === 'minimo_6_caracteres'
          ? 'La contraseña debe tener al menos 6 caracteres.'
          : 'No se pudo crear la contraseña. Intentá de nuevo.');
        return;
      }
      // Auto-login with the new password
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: newPwd }),
      });
      if (loginRes.ok && !(await loginRes.json()).needs_activation) {
        router.push('/dashboard');
      } else {
        setError('Contraseña creada. Ingresá con tu nueva contraseña.');
        setMode('login');
        setPassword('');
      }
    } catch {
      setError('Error de conexión. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div
          className="w-full flex justify-center items-center py-6 rounded-t-2xl"
          style={{ background: UAA_PURPLE }}
        >
          <Image src="/logo-clubuaa.png" alt="Club UAA" width={160} height={60} style={{ objectFit: 'contain' }} />
        </div>
        <div className="rounded-b-2xl border border-t-0 border-gray-100 shadow-md p-8 bg-white">
          <h1 className="text-lg font-bold text-center" style={{ color: UAA_PURPLE }}>
            Dashboard NPS
          </h1>

          {mode === 'activate' ? (
            <>
              <p className="text-xs text-center text-gray-500 mt-1 mb-6">
                Primera vez? Creá tu contraseña para{' '}
                <span className="font-medium text-gray-700">{email}</span>
              </p>
              <form onSubmit={handleActivate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
                  <input
                    type="password"
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-700 focus:ring-1 focus:ring-purple-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
                  <input
                    type="password"
                    value={confirmPwd}
                    onChange={e => setConfirmPwd(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-700 focus:ring-1 focus:ring-purple-700"
                  />
                </div>
                {error && (
                  <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg text-white font-semibold text-sm transition-opacity disabled:opacity-60"
                  style={{ background: UAA_PURPLE }}
                >
                  {loading ? 'Guardando…' : 'Crear contraseña e ingresar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setNewPwd(''); setConfirmPwd(''); }}
                  className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Volver
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6"/>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="usuario@uaa.com.ar"
                    required
                    autoComplete="email"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-700 focus:ring-1 focus:ring-purple-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-700 focus:ring-1 focus:ring-purple-700"
                  />
                </div>
                {error && (
                  <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg text-white font-semibold text-sm transition-opacity disabled:opacity-60"
                  style={{ background: UAA_PURPLE }}
                >
                  {loading ? 'Ingresando…' : 'Ingresar'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
