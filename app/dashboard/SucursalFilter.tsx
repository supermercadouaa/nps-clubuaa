'use client';

import { useRouter } from 'next/navigation';

export default function SucursalFilter({
  sucursales,
  current,
  activeTab,
}: {
  sucursales: { code: string; name: string }[];
  current: string;
  activeTab: string;
}) {
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const p = new URLSearchParams();
    if (activeTab !== 'resumen') p.set('tab', activeTab);
    if (e.target.value) p.set('sucursal', e.target.value);
    const qs = p.toString();
    router.push(`/dashboard${qs ? '?' + qs : ''}`);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 shrink-0">Sucursal</span>
      <select
        value={current}
        onChange={onChange}
        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-400 shadow-sm"
      >
        <option value="">Todas</option>
        {sucursales.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
