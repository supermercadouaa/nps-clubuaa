import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/mssql';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, q1, q2, q3, q4, q5, aspectos, comentario } = body;

  if (!token || !q1 || !q2 || !q3 || !q4 || !q5) {
    return NextResponse.json({ error: 'datos_incompletos' }, { status: 400 });
  }

  try {
    const pool = await getPool();

    /* Token demo público — guarda sin requerir fila en nps_enviados */
    if (token === 'test-demo-habilitado') {
      const clasificacion = q1 <= 2 ? 'detractor' : q1 === 3 ? 'pasivo' : 'promotor';
      const aspectosStr: string | null =
        aspectos && aspectos.length > 0 ? (aspectos as string[]).join(', ') : null;
      const demoToken = `test-demo-habilitado-${Date.now()}`;

      await pool.request()
        .input('token',      demoToken)
        .input('cliente_id', 0)
        .input('ticket_id',  0)
        .input('score',      q1)
        .input('clasif',     clasificacion)
        .input('canal',      'whatsapp')
        .input('q2',         q2)
        .input('q3',         q3)
        .input('q4',         q4)
        .input('q5',         q5)
        .input('aspectos',   aspectosStr)
        .input('comentario', comentario || null)
        .query(`
          INSERT INTO nps_respuestas
            (token, cliente_id, ticket_id, score, clasificacion, canal,
             score_experiencia, score_productos, score_precios, score_atencion,
             aspectos_mejorar, comentario, respondido_at)
          VALUES
            (@token, @cliente_id, @ticket_id, @score, @clasif, @canal,
             @q2, @q3, @q4, @q5, @aspectos, @comentario,
             DATEADD(hour, -3, GETUTCDATE()))
        `);

      return NextResponse.json({ ok: true });
    }

    const check = await pool.request()
      .input('token', token)
      .query('SELECT cliente_id, ticket_id, canal, respondido, expira_at FROM nps_enviados WHERE token = @token');

    if (check.recordset.length === 0)
      return NextResponse.json({ error: 'token_invalido' }, { status: 404 });

    const env = check.recordset[0];

    if (env.respondido)
      return NextResponse.json({ error: 'ya_respondido' }, { status: 409 });

    if (new Date(env.expira_at) < new Date())
      return NextResponse.json({ error: 'token_expirado' }, { status: 410 });

    const clasificacion = q1 <= 2 ? 'detractor' : q1 === 3 ? 'pasivo' : 'promotor';
    const aspectosStr: string | null =
      aspectos && aspectos.length > 0 ? (aspectos as string[]).join(', ') : null;

    await pool.request()
      .input('token',      token)
      .input('cliente_id', env.cliente_id)
      .input('ticket_id',  env.ticket_id)
      .input('score',      q1)
      .input('clasif',     clasificacion)
      .input('canal',      env.canal ?? 'whatsapp')
      .input('q2',         q2)
      .input('q3',         q3)
      .input('q4',         q4)
      .input('q5',         q5)
      .input('aspectos',   aspectosStr)
      .input('comentario', comentario || null)
      .query(`
        INSERT INTO nps_respuestas
          (token, cliente_id, ticket_id, score, clasificacion, canal,
           score_experiencia, score_productos, score_precios, score_atencion,
           aspectos_mejorar, comentario, respondido_at)
        VALUES
          (@token, @cliente_id, @ticket_id, @score, @clasif, @canal,
           @q2, @q3, @q4, @q5, @aspectos, @comentario,
           DATEADD(hour, -3, GETUTCDATE()))
      `);

    await pool.request()
      .input('token', token)
      .query('UPDATE nps_enviados SET respondido = 1 WHERE token = @token');

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[NPS] Error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
