'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/dashboard/login');
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
      style={{
        background: 'rgba(255,255,255,0.12)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.25)',
      }}
    >
      {loading ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  );
}
