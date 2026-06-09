'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const UAA_PURPLE = '#3b1f8c';
const UAA_LIGHT  = '#f3f0ff';

/* ── Header con logo ── */
function Header() {
  return (
    <div
      className="w-full flex justify-center items-center py-6 mb-0 rounded-t-2xl"
      style={{ background: UAA_PURPLE }}
    >
      <Image src="/logo-clubuaa.png" alt="Club UAA" width={160} height={60} style={{ objectFit: 'contain' }} />
    </div>
  );
}

/* ── Estrellas interactivas ── */
function StarRating({
  value, onChange, minLabel, maxLabel,
}: { value: number; onChange: (v: number) => void; minLabel: string; maxLabel: string }) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <div className="mt-2">
      <div className="flex gap-2 justify-center my-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            aria-label={`${star} estrella${star > 1 ? 's' : ''}`}
            className="text-4xl transition-all duration-100 focus:outline-none select-none"
            style={{
              color: star <= active ? '#f59e0b' : '#d1d5db',
              transform: star <= active ? 'scale(1.2)' : 'scale(1)',
            }}
          >
            ★
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-400 px-1">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

/* ── Bloque de pregunta ── */
function QuestionBlock({ number, text, children }: { number: number; text: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 mb-3 border border-gray-100 bg-white shadow-sm">
      <p className="text-sm font-semibold text-gray-800">
        <span className="text-purple-600 mr-1">{number}.</span>{text}
      </p>
      {children}
    </div>
  );
}

/* ── Aspectos de mejora ── */
const ASPECTOS = [
  'Precios',
  'Variedad de productos',
  'Disponibilidad de stock',
  'Atención del personal',
  'Rapidez en línea de cajas',
  'Limpieza y orden de la sucursal',
  'Promociones y beneficios',
  'Calidad',
  'Otro',
  'Estoy conforme con mi experiencia',
];
const CONFORME = 'Estoy conforme con mi experiencia';

/* ════════════════════════════════════════ */
export default function SurveyForm({ token, demo = false }: { token: string; demo?: boolean }) {
  const router = useRouter();

  const [q1, setQ1] = useState(0);
  const [q2, setQ2] = useState(0);
  const [q3, setQ3] = useState(0);
  const [q4, setQ4] = useState(0);
  const [q5, setQ5] = useState(0);
  const [aspectos, setAspectos] = useState<string[]>([]);
  const [comentario, setComentario] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  function toggleAspecto(opcion: string) {
    if (opcion === CONFORME) {
      setAspectos((p) => (p.includes(CONFORME) ? [] : [CONFORME]));
    } else {
      setAspectos((p) => {
        const s = p.filter((a) => a !== CONFORME);
        return s.includes(opcion) ? s.filter((a) => a !== opcion) : [...s, opcion];
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (demo) {
      alert('Modo demo: el formulario no guarda respuestas.');
      return;
    }

    if (!q1 || !q2 || !q3 || !q4 || !q5) {
      setError('Por favor completá todas las preguntas de estrellas.');
      return;
    }
    setSending(true);
    setError('');

    try {
      const res = await fetch('/api/respuesta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, q1, q2, q3, q4, q5, aspectos, comentario }),
      });

      if (res.ok) {
        router.push('/gracias');
      } else {
        const data = await res.json();
        if (data.error === 'ya_respondido') setError('Este link ya fue utilizado.');
        else if (data.error === 'token_expirado') setError('Este link ya expiró (vigencia 7 días).');
        else setError('Ocurrió un error. Intentá nuevamente.');
        setSending(false);
      }
    } catch {
      setError('Error de conexión. Verificá tu internet.');
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-start py-8 px-4">
      <div className="w-full max-w-lg">

        {/* Header violeta con logo */}
        <Header />

        {/* Banner intro */}
        <div
          className="w-full px-6 py-4 mb-6"
          style={{ background: UAA_LIGHT, borderLeft: `4px solid ${UAA_PURPLE}` }}
        >
          <h1 className="text-base font-bold text-gray-800">Tu opinión nos ayuda a mejorar</h1>
          <p className="text-sm text-gray-600 mt-1">
            Queremos conocer tu experiencia de compra. Completar esta encuesta te llevará{' '}
            <strong>menos de 1 minuto</strong>.
          </p>
          {demo && (
            <p className="text-xs mt-2 font-semibold" style={{ color: UAA_PURPLE }}>
              ⚠️ Modo demo — las respuestas no se guardan
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <QuestionBlock number={1} text="¿Qué tan probable es que recomiendes a SuperUAA a familiares o amigos?">
            <StarRating value={q1} onChange={setQ1} minLabel="Nada probable" maxLabel="Muy probable" />
          </QuestionBlock>

          <QuestionBlock number={2} text="En general, ¿cómo calificarías tu experiencia de compra en nuestra sucursal?">
            <StarRating value={q2} onChange={setQ2} minLabel="Muy mala" maxLabel="Excelente" />
          </QuestionBlock>

          <QuestionBlock number={3} text="¿Pudiste encontrar los productos que buscabas durante tu compra?">
            <StarRating value={q3} onChange={setQ3} minLabel="No encontré casi nada" maxLabel="Encontré todo" />
          </QuestionBlock>

          <QuestionBlock number={4} text="¿Cómo calificás nuestros precios?">
            <StarRating value={q4} onChange={setQ4} minLabel="Muy malos" maxLabel="Excelentes" />
          </QuestionBlock>

          <QuestionBlock number={5} text="¿Cómo calificás la atención recibida por parte de nuestro equipo?">
            <StarRating value={q5} onChange={setQ5} minLabel="Muy mala" maxLabel="Excelente" />
          </QuestionBlock>

          {/* Q6 — Multi-select */}
          <div className="rounded-xl p-4 mb-3 border border-gray-100 bg-white shadow-sm">
            <p className="text-sm font-semibold text-gray-800">
              <span className="text-purple-600 mr-1">6.</span>
              ¿En qué aspecto considerás que podemos mejorar?
            </p>
            <p className="text-xs text-gray-400 mt-0.5 mb-3">Podés seleccionar una o más opciones</p>
            <div className="grid grid-cols-1 gap-1.5">
              {ASPECTOS.map((opcion) => {
                const checked = aspectos.includes(opcion);
                return (
                  <label
                    key={opcion}
                    className="flex items-center gap-3 cursor-pointer rounded-lg px-3 py-2 transition-colors"
                    style={{
                      background: checked ? UAA_LIGHT : '#f9fafb',
                      border: `1px solid ${checked ? UAA_PURPLE : '#e5e7eb'}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAspecto(opcion)}
                      className="w-4 h-4 flex-shrink-0 accent-purple-700"
                    />
                    <span className="text-sm text-gray-700">{opcion}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Q7 — Comentario */}
          <div className="rounded-xl p-4 mb-6 border border-gray-100 bg-white shadow-sm">
            <p className="text-sm font-semibold text-gray-800">
              <span className="text-purple-600 mr-1">7.</span>
              Dejanos un comentario o sugerencia{' '}
              <span className="text-gray-400 font-normal">(opcional)</span>
            </p>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="Tu opinión es muy importante para nosotros..."
              className="w-full mt-2 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-50"
            />
            <p className="text-right text-xs mt-1 text-gray-400">{comentario.length}/500</p>
          </div>

          {error && (
            <div className="rounded-lg px-4 py-3 mb-4 text-sm text-red-700 bg-red-50 border border-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full py-4 rounded-xl font-bold text-base text-white tracking-wide transition-all focus:outline-none focus:ring-2 focus:ring-purple-400"
            style={{
              background: sending ? '#7c5cbf' : UAA_PURPLE,
              opacity: sending ? 0.8 : 1,
              boxShadow: '0 4px 14px rgba(59,31,140,0.3)',
            }}
          >
            {demo ? 'Demo — no guarda respuestas' : sending ? 'Enviando...' : 'Enviar mi opinión'}
          </button>
        </form>

        <p className="text-center text-xs mt-5 text-gray-400">
          Tus respuestas son confidenciales y se usan únicamente para mejorar nuestro servicio.
        </p>
      </div>
    </div>
  );
}
