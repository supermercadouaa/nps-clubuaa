'use client';

import { useRouter } from 'next/navigation';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function DateNav({ fecha }: { fecha: string }) {
  const router = useRouter();

  function navigate(days: number) {
    const d = new Date(fecha + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    router.push(`/dashboard/reporte?fecha=${next}`);
  }

  const [y, m, d] = fecha.split('-').map(Number);
  const dayName = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const label = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y} — ${dayName}`;

  const btnBase =
    'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors bg-white border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100';

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button onClick={() => navigate(-1)} className={btnBase}>← Anterior</button>
      <span className="text-sm font-semibold text-gray-700 px-2">{label}</span>
      <button onClick={() => navigate(1)} className={btnBase}>Siguiente →</button>
      <button
        onClick={() => window.print()}
        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#3b1f8c] text-white hover:bg-[#2e1870] transition-colors ml-2"
      >
        Descargar PDF
      </button>
    </div>
  );
}
