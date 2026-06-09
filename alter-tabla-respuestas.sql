-- Script OPCIONAL: agrega columnas separadas para cada pregunta.
-- La versión inicial usa el campo "comentario" para guardar los aspectos.
-- Ejecutar solo si se quiere analítica por pregunta en PostgreSQL.

ALTER TABLE nps_respuestas
  ADD COLUMN IF NOT EXISTS score_experiencia  SMALLINT CHECK(score_experiencia  BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS score_productos    SMALLINT CHECK(score_productos    BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS score_precios      SMALLINT CHECK(score_precios      BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS score_atencion     SMALLINT CHECK(score_atencion     BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS aspectos_mejorar   TEXT;

-- Comentario: score existente = Q1 (recomendación NPS, escala 1-5)
-- clasificacion existente = promotor/pasivo/detractor basado en score
