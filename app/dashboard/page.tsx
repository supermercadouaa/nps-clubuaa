export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { verifySession } from '@/lib/auth';
import { getPool } from '@/lib/mssql';
import mysqlPool from '@/lib/mysql';
import DashboardClient, { type Row } from './DashboardClient';

async function fetchRows(): Promise<Row[]> {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT score, clasificacion, comentario, canal,
           cliente_id, ticket_id, respondido_at,
           score_experiencia, score_productos, score_precios, score_atencion,
           aspectos_mejorar
    FROM nps_respuestas
    WHERE respondido_at IS NOT NULL
    ORDER BY respondido_at DESC
  `);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const npsRows: any[] = r.recordset;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ticketIds: number[] = [...new Set<number>((npsRows as any[]).filter((r: any) => r.ticket_id > 0).map((r: any) => Number(r.ticket_id)))];

  const mysqlMap = new Map<number, {
    fecha_compra: string | null;
    hora_compra: string | null;
    c_sucursal: string | null;
    sucursal_nombre: string | null;
    nombre_cliente: string | null;
  }>();

  if (ticketIds.length > 0) {
    try {
      interface MR extends RowDataPacket {
        ticket_id: number;
        fecha_compra: Date | null;
        hora_compra: string | null;
        c_sucursal: string | null;
        sucursal_nombre: string | null;
        nombre_cliente: string | null;
      }
      const ph = ticketIds.map(() => '?').join(', ');
      const [rows] = await mysqlPool.query<MR[]>(`
        SELECT
          t.c_idticket                                            AS ticket_id,
          t.fechacorta                                            AS fecha_compra,
          t.horaticket                                            AS hora_compra,
          t.c_sucursal                                            AS c_sucursal,
          r.X_SUCURSAL                                            AS sucursal_nombre,
          CONCAT(TRIM(COALESCE(c.x_nombres,'')), ' ',
                 TRIM(COALESCE(c.x_apellidocli,'')))             AS nombre_cliente
        FROM ticket_super t
        LEFT JOIN ref_sucursal     r ON t.c_sucursal   = r.C_SUCURSAL
        LEFT JOIN cliente_clubuaa  c ON t.n_codcliente = c.c_cliente
        WHERE t.c_idticket IN (${ph})
      `, ticketIds);

      for (const m of rows) {
        let fecha_compra: string | null = null;
        if (m.fecha_compra) {
          const d = m.fecha_compra instanceof Date ? m.fecha_compra : new Date(String(m.fecha_compra));
          fecha_compra = `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
        }
        mysqlMap.set(Number(m.ticket_id), {
          fecha_compra,
          hora_compra:     m.hora_compra ?? null,
          c_sucursal:      m.c_sucursal ?? null,
          sucursal_nombre: m.sucursal_nombre ?? null,
          nombre_cliente:  m.nombre_cliente?.trim() || null,
        });
      }
    } catch (e) {
      console.error('[MySQL enrichment]', e);
    }
  }

  return npsRows
    .filter(row => row.respondido_at != null)
    .map(row => {
    const m = row.ticket_id > 0 ? mysqlMap.get(Number(row.ticket_id)) : undefined;
    const rawAt = row.respondido_at;
    const at = rawAt instanceof Date ? rawAt : new Date(String(rawAt));
    const safeIso = !isNaN(at.getTime()) ? at.toISOString() : new Date(0).toISOString();
    return {
      score:             Number(row.score),
      clasificacion:     String(row.clasificacion),
      comentario:        row.comentario ?? null,
      canal:             String(row.canal),
      cliente_id:        Number(row.cliente_id),
      ticket_id:         Number(row.ticket_id),
      respondido_at:     safeIso,
      score_experiencia: row.score_experiencia != null ? Number(row.score_experiencia) : null,
      score_productos:   row.score_productos   != null ? Number(row.score_productos)   : null,
      score_precios:     row.score_precios     != null ? Number(row.score_precios)     : null,
      score_atencion:    row.score_atencion    != null ? Number(row.score_atencion)    : null,
      aspectos_mejorar:  row.aspectos_mejorar  ?? null,
      fecha_compra:      m?.fecha_compra      ?? null,
      hora_compra:       m?.hora_compra       ?? null,
      c_sucursal:        m?.c_sucursal        ?? null,
      sucursal_nombre:   m?.sucursal_nombre   ?? null,
      nombre_cliente:    m?.nombre_cliente    ?? null,
    };
  });
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('nps_session')?.value;
  const email = token ? verifySession(token) : null;
  if (!email) redirect('/dashboard/login');

  const rows = await fetchRows();
  return <DashboardClient rows={rows} email={email} />;
}
