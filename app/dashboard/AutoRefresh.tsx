'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const UAA_PURPLE = '#3b1f8c';

export default function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    const t = setInterval(() => {
      router.refresh();
      setLastUpdate(new Date());
    }, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);

  function handleManual() {
    setLoading(true);
    router.refresh();
    setLastUpdate(new Date());
    setTimeout(() => setLoading(false), 800);
  }

  const fmt = lastUpdate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex items-center gap-3">
      <span className="text-purple-200 text-xs hidden sm:inline">
        Actualizado {fmt}
      </span>
      <button
        onClick={handleManual}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
        style={{
          background: loading ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.18)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.25)',
        }}
      >
        <svg
          className={loading ? 'animate-spin' : ''}
          width={13} height={13} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M23 4v6h-6" />
          <path d="M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        {loading ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  );
}
