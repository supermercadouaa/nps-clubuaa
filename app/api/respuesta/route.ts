import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/mssql';
import sql from 'mssql';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, q1, q2, q3, q4, q5, aspectos, comentario } = body;

  if (!token || !q1 || !q2 || !q3 || !q4 || !q5) {
    return NextResponse.json({ error: 'datos_incompletos' }, { status: 400 });
  }

  try {
    const pool = await getPool();

    const check = await pool.request()
      .input('token', sql.VarChar(64), token)
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
      .input('token',      sql.VarChar(64),  token)
      .input('cliente_id', sql.Int,           env.cliente_id)
      .input('ticket_id',  sql.Int,           env.ticket_id)
      .input('score',      sql.SmallInt,      q1)
      .input('clasif',     sql.VarChar(20),   clasificacion)
      .input('canal',      sql.VarChar(20),   env.canal ?? 'whatsapp')
      .input('q2',         sql.SmallInt,      q2)
      .input('q3',         sql.SmallInt,      q3)
      .input('q4',         sql.SmallInt,      q4)
      .input('q5',         sql.SmallInt,      q5)
      .input('aspectos',   sql.VarChar(500),  aspectosStr)
      .input('comentario', sql.VarChar(1000), comentario || null)
      .query(`
        INSERT INTO nps_respuestas
          (token, cliente_id, ticket_id, score, clasificacion, canal,
           score_experiencia, score_productos, score_precios, score_atencion,
           aspectos_mejorar, comentario)
        VALUES
          (@token, @cliente_id, @ticket_id, @score, @clasif, @canal,
           @q2, @q3, @q4, @q5, @aspectos, @comentario)
      `);

    await pool.request()
      .input('token', sql.VarChar(64), token)
      .query('UPDATE nps_enviados SET respondido = 1 WHERE token = @token');

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[NPS] Error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
