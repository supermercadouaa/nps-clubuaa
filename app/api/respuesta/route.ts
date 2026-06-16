import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, q1, q2, q3, q4, q5, aspectos, comentario } = body;

  if (!token || !q1 || !q2 || !q3 || !q4 || !q5) {
    return NextResponse.json({ error: 'datos_incompletos' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Token publico generico: cualquiera con el link puede responder.
    // Cada submission genera su propio UUID para respetar el UNIQUE de nps_respuestas.
    // cliente_id=0 y ticket_id=0 identifican estas respuestas en reportes.
    if (token === 'abcdaddf130814') {
      const clasificacion = q1 <= 2 ? 'detractor' : q1 === 3 ? 'pasivo' : 'promotor';
      const aspectosStr: string | null =
        aspectos && aspectos.length > 0 ? (aspectos as string[]).join(', ') : null;
      const publicToken = crypto.randomUUID().replace(/-/g, '');

      await client.query(
        `INSERT INTO nps_respuestas
           (token, cliente_id, ticket_id, score, clasificacion, canal,
            score_experiencia, score_productos, score_precios, score_atencion,
            aspectos_mejorar, comentario)
         VALUES ($1, 0, 0, $2, $3, 'whatsapp', $4, $5, $6, $7, $8, $9)`,
        [publicToken, q1, clasificacion, q2, q3, q4, q5, aspectosStr, comentario || null]
      );
      return NextResponse.json({ ok: true });
    }

    const check = await client.query(
      `SELECT cliente_id, ticket_id, canal, respondido, expira_at
       FROM nps_enviados WHERE token = $1`,
      [token]
    );

    if (check.rows.length === 0)
      return NextResponse.json({ error: 'token_invalido' }, { status: 404 });

    const env = check.rows[0];

    if (env.respondido)
      return NextResponse.json({ error: 'ya_respondido' }, { status: 409 });

    if (new Date(env.expira_at) < new Date())
      return NextResponse.json({ error: 'token_expirado' }, { status: 410 });

    // Q1 determina clasificacion NPS (1-2 detractor, 3 pasivo, 4-5 promotor)
    const clasificacion = q1 <= 2 ? 'detractor' : q1 === 3 ? 'pasivo' : 'promotor';

    // Q6: aspectos seleccionados como texto separado por comas
    const aspectosStr: string | null =
      aspectos && aspectos.length > 0 ? (aspectos as string[]).join(', ') : null;

    await client.query('BEGIN');

    /*
     * INSERT usando todas las columnas de nps_respuestas:
     *   score              = Q1 recomendacion (1-5)
     *   score_experiencia  = Q2 (1-5)
     *   score_productos    = Q3 (1-5)
     *   score_precios      = Q4 (1-5)
     *   score_atencion     = Q5 (1-5)
     *   aspectos_mejorar   = Q6 separado por comas
     *   comentario         = Q7 texto libre
     */
    await client.query(
      `INSERT INTO nps_respuestas
         (token, cliente_id, ticket_id, score, clasificacion, canal,
          score_experiencia, score_productos, score_precios, score_atencion,
          aspectos_mejorar, comentario)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        token,
        env.cliente_id,
        env.ticket_id,
        q1,
        clasificacion,
        env.canal,
        q2,
        q3,
        q4,
        q5,
        aspectosStr,
        comentario || null,
      ]
    );

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
    console.error('[NPS] Error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  } finally {
    client.release();
  }
}
