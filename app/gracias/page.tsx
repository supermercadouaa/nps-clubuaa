import Image from 'next/image';

const UAA_PURPLE = '#3b1f8c';

export default function Gracias() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-start py-8 px-4">
      <div className="w-full max-w-sm">
        <div
          className="w-full flex justify-center items-center py-6 rounded-t-2xl"
          style={{ background: UAA_PURPLE }}
        >
          <Image src="/logo-clubuaa.png" alt="Club UAA" width={160} height={60} style={{ objectFit: 'contain' }} />
        </div>

        <div className="rounded-b-2xl border border-t-0 border-gray-100 shadow-md p-8 text-center bg-white">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-xl font-bold mb-3" style={{ color: UAA_PURPLE }}>
            ¡Gracias por tu opinión!
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            Tu respuesta fue registrada exitosamente.
            <br />
            Tus comentarios nos ayudan a mejorar cada día para darte la mejor experiencia en{' '}
            <strong style={{ color: UAA_PURPLE }}>SuperUAA</strong>.
          </p>
          <div
            className="mt-6 rounded-xl px-5 py-3 text-sm font-medium"
            style={{ background: '#f3f0ff', color: UAA_PURPLE }}
          >
            ¡Nos vemos pronto! 🛒
          </div>
        </div>
      </div>
    </div>
  );
}
