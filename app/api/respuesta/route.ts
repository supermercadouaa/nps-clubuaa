import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, q1, q2, q3, q4, q5, aspectos, comentario } = body;

  // Validación básica
  if (!token || !q1 || !q2 || !q3 || !q4 || !q5) {
    return NextResponse.json({ error: 'datos_incompletos' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Verificar token
    const check = await client.query(
      `SELECT cliente_id, ticket_id, canal, respondido, expira_at
       FROM nps_enviados WHERE token = $1`,
      [token]
    );

    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'token_invalido' }, { status: 404 });
    }

    const env = check.rows[0];

    if (env.respondido) {
      return NextResponse.json({ error: 'ya_respondido' }, { status: 409 });
    }
    if (new Date(env.expira_at) < new Date()) {
      return NextResponse.json({ error: 'token_expirado' }, { status: 410 });
    }

    // Clasificación NPS basada en Q1 (recomendación, escala 1-5)
    const clasificacion = q1 <= 2 ? 'detractor' : q1 === 3 ? 'pasivo' : 'promotor';

    // Texto del comentario: combina los aspectos seleccionados + texto libre
    // Se guarda en el campo "comentario" ya existente en la tabla
    const aspectosStr = aspectos && aspectos.length > 0
      ? `[Aspectos: ${aspectos.join(', ')}]${comentario ? ' ' + comentario : ''}`
      : comentario || null;

    await client.query('BEGIN');

    /*
     * INSERT en nps_respuestas usando exactamente los campos de la tabla:
     *   token, cliente_id, ticket_id, score, clasificacion, comentario, canal
     *
     * score = q1 (pregunta NPS de recomendación, 1-5)
     * clasificacion = promotor / pasivo / detractor
     * comentario = aspectos seleccionados + texto libre del usuario
     */
    await client.query(
      `INSERT INTO nps_respuestas
         (token, cliente_id, ticket_id, score, clasificacion, comentario, canal)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        token,
        env.cliente_id,
        env.ticket_id,
        q1,              // score — escala 1-5, entra dentro del CHECK(0-10)
        clasificacion,
        aspectosStr,
        env.canal,
      ]
    );

    // Marcar como respondido en nps_enviados
    await client.query(
      `UPDATE nps_enviados
       SET respondido = TRUE, abierto = TRUE, abierto_at = NOW()
       WHERE token = $1`,
      [token]
    );

    await client.query('COMMIT');

    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[NPS] Error al guardar respuesta:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  } finally {
    client.release();
  }
}
