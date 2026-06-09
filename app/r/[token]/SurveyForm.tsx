'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/* ── Logo Club UAA ── */
function LogoUAA() {
  return (
    <div className="flex flex-col items-center mb-6">
      <div className="flex flex-col items-center leading-none">
        <span className="text-white text-2xl font-light tracking-widest">Club</span>
        <span
          className="text-white text-3xl font-black tracking-widest px-5 py-1 rounded-full mt-1"
          style={{ background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)' }}
        >
          UAA
        </span>
      </div>
    </div>
  );
}

/* ── Estrellas interactivas ── */
type StarProps = {
  value: number;
  onChange: (v: number) => void;
  minLabel: string;
  maxLabel: string;
  required?: boolean;
};

function StarRating({ value, onChange, minLabel, maxLabel }: StarProps) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <div className="mt-2">
      <div className="flex gap-3 justify-center my-2">
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
              color: star <= active ? '#facc15' : 'rgba(255,255,255,0.25)',
              transform: star <= active ? 'scale(1.15)' : 'scale(1)',
              textShadow: star <= active ? '0 0 8px rgba(250,204,21,0.6)' : 'none',
            }}
          >
            ★
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

/* ── Sección de pregunta ── */
function QuestionBlock({
  number,
  text,
  children,
}: {
  number: number;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-5 mb-4"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <p className="text-sm font-semibold text-white mb-1">
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{number}. </span>
        {text}
      </p>
      {children}
    </div>
  );
}

/* ── Opciones de mejora (pregunta 6) ── */
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

/* ════════════════════════════════════════
   Componente principal
   ════════════════════════════════════════ */
export default function SurveyForm({ token }: { token: string }) {
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
      setAspectos((prev) =>
        prev.includes(CONFORME) ? [] : [CONFORME]
      );
    } else {
      setAspectos((prev) => {
        const sinConforme = prev.filter((a) => a !== CONFORME);
        return sinConforme.includes(opcion)
          ? sinConforme.filter((a) => a !== opcion)
          : [...sinConforme, opcion];
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q1 || !q2 || !q3 || !q4 || !q5) {
      setError('Por favor completá todas las preguntas de estrellas antes de enviar.');
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
        if (data.error === 'ya_respondido') {
          setError('Este link ya fue utilizado. ¡Gracias por tu respuesta anterior!');
        } else if (data.error === 'token_expirado') {
          setError('Este link ya expiró. Los links tienen vigencia de 7 días.');
        } else {
          setError('Ocurrió un error al enviar tu respuesta. Intentá nuevamente.');
        }
        setSending(false);
      }
    } catch {
      setError('Error de conexión. Verificá tu internet e intentá nuevamente.');
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-8 px-4">
      <div className="w-full max-w-lg">
        <LogoUAA />

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold tracking-wide uppercase text-white">
            Tu opinión nos ayuda a mejorar
          </h1>
          <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Queremos conocer tu experiencia de compra para seguir ofreciéndote un mejor servicio.
            Completar esta encuesta te llevará <strong className="text-white">menos de 1 minuto</strong>.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Q1 */}
          <QuestionBlock number={1} text="¿Qué tan probable es que recomiendes a SuperUAA a familiares o amigos?">
            <StarRating
              value={q1}
              onChange={setQ1}
              minLabel="Nada probable"
              maxLabel="Muy probable"
            />
          </QuestionBlock>

          {/* Q2 */}
          <QuestionBlock number={2} text="En general, ¿cómo calificarías tu experiencia de compra en nuestra sucursal?">
            <StarRating
              value={q2}
              onChange={setQ2}
              minLabel="Muy mala"
              maxLabel="Excelente"
            />
          </QuestionBlock>

          {/* Q3 */}
          <QuestionBlock number={3} text="¿Pudiste encontrar los productos que buscabas durante tu compra?">
            <StarRating
              value={q3}
              onChange={setQ3}
              minLabel="No encontré casi nada"
              maxLabel="Encontré todo lo que buscaba"
            />
          </QuestionBlock>

          {/* Q4 */}
          <QuestionBlock number={4} text="¿Cómo calificás nuestros precios?">
            <StarRating
              value={q4}
              onChange={setQ4}
              minLabel="Muy malos"
              maxLabel="Excelentes"
            />
          </QuestionBlock>

          {/* Q5 */}
          <QuestionBlock number={5} text="¿Cómo calificás la atención recibida por parte de nuestro equipo?">
            <StarRating
              value={q5}
              onChange={setQ5}
              minLabel="Muy mala"
              maxLabel="Excelente"
            />
          </QuestionBlock>

          {/* Q6 — Multi-select */}
          <div
            className="rounded-2xl p-5 mb-4"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <p className="text-sm font-semibold text-white mb-1">
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>6. </span>
              ¿En qué aspecto considerás que podemos mejorar?
            </p>
            <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Podés seleccionar una o más opciones
            </p>
            <div className="grid grid-cols-1 gap-2">
              {ASPECTOS.map((opcion) => {
                const checked = aspectos.includes(opcion);
                return (
                  <label
                    key={opcion}
                    className="flex items-center gap-3 cursor-pointer rounded-xl px-4 py-2.5 transition-colors"
                    style={{
                      background: checked ? 'rgba(109,40,217,0.4)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${checked ? 'rgba(109,40,217,0.7)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAspecto(opcion)}
                      className="accent-purple-500 w-4 h-4 flex-shrink-0"
                    />
                    <span className="text-sm text-white">{opcion}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Q7 — Comentario opcional */}
          <div
            className="rounded-2xl p-5 mb-6"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <p className="text-sm font-semibold text-white mb-1">
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>7. </span>
              Si lo deseás, dejanos un comentario o sugerencia{' '}
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>(opcional)</span>
            </p>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="Tu opinión es muy importante para nosotros..."
              className="w-full mt-2 rounded-xl px-4 py-3 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            />
            <p className="text-right text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {comentario.length}/500
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl px-4 py-3 mb-4 text-sm text-white" style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)' }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={sending}
            className="w-full py-4 rounded-2xl font-bold text-base tracking-wide transition-all focus:outline-none focus:ring-2 focus:ring-purple-400"
            style={{
              background: sending ? 'rgba(109,40,217,0.4)' : 'linear-gradient(135deg, #6d28d9, #7c3aed)',
              color: '#fff',
              opacity: sending ? 0.7 : 1,
              boxShadow: sending ? 'none' : '0 4px 20px rgba(109,40,217,0.5)',
            }}
          >
            {sending ? 'Enviando...' : 'Enviar mi opinión'}
          </button>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Tus respuestas son confidenciales y se usan únicamente para mejorar nuestro servicio.
        </p>
      </div>
    </div>
  );
}
