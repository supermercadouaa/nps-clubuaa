export default function Gracias() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div
        className="w-full max-w-sm rounded-3xl p-10 text-center"
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <span className="text-white text-2xl font-light tracking-widest">Club</span>
          <span
            className="text-white text-3xl font-black tracking-widest px-5 py-1 rounded-full mt-1"
            style={{ background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)' }}
          >
            UAA
          </span>
        </div>

        <div className="text-6xl mb-5">🎉</div>

        <h1 className="text-2xl font-bold text-white mb-3">
          ¡Gracias por tu opinión!
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
          Tu respuesta fue registrada exitosamente.
          <br />
          Tus comentarios nos ayudan a mejorar cada día para darte la mejor experiencia en <strong className="text-white">SuperUAA</strong>.
        </p>

        <div
          className="mt-8 rounded-2xl px-5 py-4"
          style={{ background: 'rgba(109,40,217,0.2)', border: '1px solid rgba(109,40,217,0.4)' }}
        >
          <p className="text-sm text-white font-medium">¡Nos vemos pronto! 🛒</p>
        </div>
      </div>
    </div>
  );
}
