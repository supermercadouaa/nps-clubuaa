'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';

const UAA_PURPLE = '#3b1f8c';

function ActivarForm() {
  const params  = useSearchParams();
  const router  = useRouter();
  const token   = params.get('token') ?? '';

  const [pwd,    setPwd]    = useState('');
  const [pwd2,   setPwd2]   = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [err,    setErr]    = useState('');

  useEffect(() => {
    if (!token) setStatus('error');
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd !== pwd2) { setErr('Las contraseñas no coinciden'); return; }
    if (pwd.length < 6) { setErr('Mínimo 6 caracteres'); return; }
    setStatus('loading'); setErr('');
    const r = await fetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: pwd }),
    });
    if (r.ok) {
      setStatus('ok');
      setTimeout(() => router.push('/dashboard/login'), 2500);
    } else {
      const d = await r.json();
      setErr(
        d.error === 'link_invalido_o_expirado'
          ? 'El link expiró o ya fue usado. Pedile uno nuevo al administrador.'
          : d.error === 'minimo_6_caracteres'
          ? 'La contraseña debe tener al menos 6 caracteres.'
          : 'Ocurrió un error. Intentá de nuevo.'
      );
      setStatus('idle');
    }
  }

  const inp = 'w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="rounded-xl p-3" style={{ background: UAA_PURPLE }}>
            <Image src="/logo-clubuaa.png" alt="Club UAA" width={100} height={36} style={{ objectFit: 'contain' }}/>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

          {status === 'ok' ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <h2 className="text-base font-semibold text-gray-800 mb-1">¡Contraseña configurada!</h2>
              <p className="text-sm text-gray-500">Redirigiendo al login…</p>
            </div>

          ) : !token ? (
            <div className="text-center">
              <p className="text-sm text-red-500 font-medium">Link inválido.</p>
              <p className="text-xs text-gray-400 mt-1">Pedile al administrador que genere uno nuevo.</p>
            </div>

          ) : (
            <>
              <h1 className="text-base font-bold text-gray-800 mb-1">Configurar contraseña</h1>
              <p className="text-xs text-gray-400 mb-6">NPS Dashboard · Supermercados UAA</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Nueva contraseña</label>
                  <input
                    type="password"
                    className={inp}
                    placeholder="Mínimo 6 caracteres"
                    value={pwd}
                    onChange={e => setPwd(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Confirmar contraseña</label>
                  <input
                    type="password"
                    className={inp}
                    placeholder="Repetí la contraseña"
                    value={pwd2}
                    onChange={e => setPwd2(e.target.value)}
                    required
                  />
                </div>
                {err && <p className="text-xs text-red-500">{err}</p>}
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full h-10 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ background: UAA_PURPLE }}
                >
                  {status === 'loading' ? 'Guardando…' : 'Guardar contraseña'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">encuesta.clubuaa.ar</p>
      </div>
    </div>
  );
}

export default function ActivarPage() {
  return (
    <Suspense>
      <ActivarForm/>
    </Suspense>
  );
}
