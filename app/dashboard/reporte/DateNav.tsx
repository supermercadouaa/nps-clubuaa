'use client';

import { useRouter } from 'next/navigation';

/* ── Helpers (duplicados del server — no se puede importar desde page.tsx) ── */
function isoDate(dt: Date): string {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function dFmt(fecha: string): string {
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}
function anchorDay(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function prevAnchor(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 1 ? -4 : day === 4 ? -3 : -1));
  return isoDate(dt);
}
function nextAnchor(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 1 ? 3 : day === 4 ? 4 : 1));
  return isoDate(dt);
}
function off(fecha: string, days: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return isoDate(dt);
}
function periodLabel(fecha: string): string {
  const day = anchorDay(fecha);
  const y = fecha.split('-')[0];
  if (day === 1) return `Vie ${dFmt(off(fecha, -3))} — Dom ${dFmt(off(fecha, -1))}/${y}`;
  if (day === 4) return `Mar ${dFmt(off(fecha, -2))} — Jue ${dFmt(fecha)}/${y}`;
  return `${dFmt(fecha)}/${y}`;
}

export default function DateNav({ fecha }: { fecha: string }) {
  const router = useRouter();
  const go = (f: string) => router.push(`/dashboard/reporte?fecha=${f}`);

  const btn = 'h-8 px-3 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors';

  return (
    <div className="flex items-center gap-2 print:hidden">
      <button className={btn} onClick={() => go(prevAnchor(fecha))}>← Anterior</button>
      <span className="text-xs font-semibold text-gray-800 min-w-[220px] text-center px-1 tabular-nums">
        {periodLabel(fecha)}
      </span>
      <button className={btn} onClick={() => go(nextAnchor(fecha))}>Siguiente →</button>
      <button
        className="h-8 px-4 rounded-lg text-xs font-semibold bg-[#3b1f8c] text-white hover:bg-[#2e1870] transition-colors ml-2"
        onClick={() => window.print()}
      >
        ↓ Descargar PDF
      </button>
    </div>
  );
}
