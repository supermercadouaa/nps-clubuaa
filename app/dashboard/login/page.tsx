'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const UAA_PURPLE = '#3b1f8c';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push('/dashboard');
      } else {
        setError('Credenciales incorrectas. El email debe ser @uaa.com.ar.');
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
          <h1 className="text-lg font-bold mb-6 text-center" style={{ color: UAA_PURPLE }}>
            Dashboard NPS
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
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
        </div>
      </div>
    </div>
  );
}
