const UAA_PURPLE = '#3b1f8c';

export default function Loading() {
  return (
    <div className="min-h-screen" style={{ background: '#f5f5f8' }}>

      {/* Header */}
      <div className="w-full py-3.5 px-6 flex items-center justify-between shadow-sm" style={{ background: UAA_PURPLE }}>
        <div className="flex items-center gap-4">
          <div className="w-[110px] h-10 rounded bg-white/20 animate-pulse" />
          <div>
            <div className="h-4 w-36 rounded bg-white/25 animate-pulse mb-1.5" />
            <div className="h-3 w-48 rounded bg-white/15 animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-32 rounded bg-white/15 animate-pulse hidden sm:block" />
          <div className="h-7 w-24 rounded-lg bg-white/20 animate-pulse" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Filters bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-8 w-52 rounded-lg bg-white border border-gray-100 shadow-sm animate-pulse" />
          <div className="h-8 w-56 rounded-lg bg-white border border-gray-100 shadow-sm animate-pulse" />
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {[120, 80, 90, 80, 100].map((w, i) => (
            <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 animate-pulse">
              <div className="h-3 rounded bg-gray-200 mb-3" style={{ width: `${w - 20}px` }} />
              <div className="h-7 w-12 rounded bg-gray-200 mb-1" />
              <div className="h-2 rounded bg-gray-100" style={{ width: `${w}px` }} />
            </div>
          ))}
        </div>

        {/* Tabs skeleton */}
        <div className="flex gap-1 mb-6">
          <div className="h-9 w-28 rounded-md bg-white border border-gray-100 animate-pulse" />
          <div className="h-9 w-32 rounded-md bg-gray-100 animate-pulse" />
          <div className="h-9 w-28 rounded-md bg-gray-100 animate-pulse" />
        </div>

        {/* Main content card */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 animate-pulse">
          {/* Gauge placeholder */}
          <div className="flex justify-center mb-6">
            <div className="h-36 w-64 rounded-full bg-gray-100" />
          </div>
          {/* Dimension bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {['Experiencia', 'Productos', 'Precios', 'Atención'].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-20 rounded bg-gray-200 shrink-0" />
                <div className="flex-1 h-2 rounded-full bg-gray-100" />
                <div className="h-3 w-6 rounded bg-gray-200 shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Cargando label */}
        <p className="text-center text-sm text-gray-400 mt-6 animate-pulse">Cargando datos…</p>
      </div>
    </div>
  );
}
