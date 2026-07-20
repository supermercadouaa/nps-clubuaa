import { NextResponse } from 'next/server';
import { getPool } from '@/lib/mssql';
import mysqlPool from '@/lib/mysql';
import type { RowDataPacket } from 'mysql2';

/* ─── Helpers (duplicados sin imports de React) ─── */
function offsetDate(fecha: string, days: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function dFmt(f: string) {
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}
function dFmtShort(f: string) {
  const [, m, d] = f.split('-');
  return `${d}/${m}`;
}
function dayNum(f: string) {
  const [y, m, d] = f.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function dayName(f: string) {
  const N = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  return N[dayNum(f)];
}
function dateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}
function avg(nums: (number | null)[]): number | null {
  const v = nums.filter(n => n != null) as number[];
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}
function normCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  return String(raw).trim().replace(/^0+/, '') || '0';
}

function getDefaultAnchor(): string {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const day = now.getUTCDay();
  const back = [3, 0, 1, 2, 0, 1, 2][day];
  const dt = new Date(now.getTime() - back * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
}

type Period = { dates: string[]; rangeLabel: string; purchaseRangeLabel: string; anchorLabel: string };

function getPeriod(anchor: string): Period {
  const day = dayNum(anchor);
  const [y] = anchor.split('-');
  if (day === 1) {
    const dates = [offsetDate(anchor, -3), offsetDate(anchor, -2), offsetDate(anchor, -1)];
    const pd = dates.map(d => offsetDate(d, -1));
    return {
      dates,
      rangeLabel:         `Vie ${dFmtShort(dates[0])} — Dom ${dFmtShort(dates[2])}/${y}`,
      purchaseRangeLabel: `Jue ${dFmtShort(pd[0])} — Sáb ${dFmtShort(pd[2])}/${y}`,
      anchorLabel:        `${dayName(anchor)} ${dFmt(anchor)}`,
    };
  }
  if (day === 4) {
    const dates = [offsetDate(anchor, -2), offsetDate(anchor, -1), anchor];
    const pd = dates.map(d => offsetDate(d, -1));
    return {
      dates,
      rangeLabel:         `Mar ${dFmtShort(dates[0])} — Jue ${dFmtShort(anchor)}/${y}`,
      purchaseRangeLabel: `Lun ${dFmtShort(pd[0])} — Mié ${dFmtShort(pd[2])}/${y}`,
      anchorLabel:        `${dayName(anchor)} ${dFmt(anchor)}`,
    };
  }
  return { dates: [anchor], rangeLabel: dFmt(anchor), purchaseRangeLabel: dFmt(offsetDate(anchor,-1)), anchorLabel: dFmt(anchor) };
}

/* ─── Email HTML ─── */
function buildEmail(data: {
  period: Period;
  nps: number; total: number; promotores: number; pasivos: number; detractores: number;
  tasa: number; enviados: number;
  avgExp: number|null; avgProd: number|null; avgPrec: number|null; avgAten: number|null;
  npsAcum: number; totalAcum: number; tasaAcum: number;
  aspectos: { a: string; n: number; pct: number }[];
  comentarios: { clasificacion: string; score: number; sucursal: string|null; comentario: string }[];
  reportUrl: string;
}): string {
  const P = '#3b1f8c';
  const G = '#16a34a';
  const A = '#ca8a04';
  const R = '#dc2626';
  const npsColor = data.nps >= 50 ? G : data.nps >= 0 ? A : R;
  const npsBadge = data.nps >= 50 ? 'Excelente' : data.nps >= 0 ? 'Bueno' : 'Crítico';
  const pPct = data.total > 0 ? Math.round((data.promotores/data.total)*100) : 0;
  const dPct = data.total > 0 ? Math.round((data.detractores/data.total)*100) : 0;
  const paPct = 100 - pPct - dPct;

  const scoreColor = (v: number|null) => v == null ? '#9ca3af' : v >= 4 ? G : v >= 3 ? A : R;
  const scoreStr   = (v: number|null) => v == null ? '—' : String(v);

  const dimRows = [
    { l: 'Experiencia general', v: data.avgExp },
    { l: 'Calidad de productos', v: data.avgProd },
    { l: 'Precios',              v: data.avgPrec },
    { l: 'Atención al cliente',  v: data.avgAten },
  ].map(({ l, v }) => `
    <tr>
      <td style="padding:6px 0;font-size:12px;color:#374151;">${l}</td>
      <td style="padding:6px 0;text-align:right;font-weight:700;font-size:13px;color:${scoreColor(v)};">${scoreStr(v)}<span style="font-size:10px;color:#9ca3af;font-weight:400;">/5</span></td>
    </tr>`).join('');

  const topAspectos = data.aspectos.slice(0, 6).map((a, i) =>
    `<tr style="background:${i % 2 === 0 ? '#f9fafb' : '#fff'}">
      <td style="padding:5px 8px;font-size:11px;color:#374151;">${i+1}. ${a.a}</td>
      <td style="padding:5px 8px;text-align:right;font-size:11px;font-weight:700;color:${P};">${a.n} <span style="color:#9ca3af;font-weight:400;">(${a.pct}%)</span></td>
    </tr>`).join('');

  const comentRows = data.comentarios.slice(0, 8).map((c, i) => {
    const [label, bg, col] = c.clasificacion === 'promotor'
      ? ['Promotor', '#dcfce7', G]
      : c.clasificacion === 'pasivo'
      ? ['Pasivo', '#fef3c7', A]
      : ['Detractor', '#fee2e2', R];
    return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
      <td style="padding:5px 8px;">
        <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:${bg};color:${col};">${label}</span>
      </td>
      <td style="padding:5px 8px;font-size:11px;font-weight:700;color:${A};">${c.score}★</td>
      <td style="padding:5px 8px;font-size:11px;color:#6b7280;">${c.sucursal ?? '—'}</td>
      <td style="padding:5px 8px;font-size:11px;color:#374151;">${c.comentario}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:${P};padding:20px 28px;">
    <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">Reporte NPS · Supermercados UAA</p>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:12px;">Emitido el ${data.period.anchorLabel}</p>
  </td></tr>

  <!-- Period info -->
  <tr><td style="background:#f5f3ff;padding:12px 28px;border-bottom:1px solid #e9d5ff;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:11px;color:#6b7280;">COMPRAS ANALIZADAS</td>
        <td style="font-size:11px;color:#6b7280;padding-left:24px;">RESPUESTAS RECIBIDAS</td>
      </tr>
      <tr>
        <td style="font-size:13px;font-weight:700;color:${P};">${data.period.purchaseRangeLabel}</td>
        <td style="font-size:13px;font-weight:700;color:#4f46e5;padding-left:24px;">${data.period.rangeLabel}</td>
      </tr>
    </table>
  </td></tr>

  <!-- NPS Hero -->
  <tr><td style="padding:28px;text-align:center;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${P};">NPS del Período</p>
    <p style="margin:0;font-size:72px;font-weight:900;line-height:1;color:${npsColor};">${data.nps > 0 ? '+'+data.nps : data.nps}</p>
    <span style="display:inline-block;margin-top:8px;padding:4px 14px;border-radius:99px;background:${npsColor}1a;color:${npsColor};font-size:12px;font-weight:600;">${npsBadge}</span>

    <!-- KPIs row -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-top:1px solid #f3f4f6;padding-top:16px;">
      <tr>
        ${[
          { l:'Respuestas', v: data.total, c:'#111827' },
          { l:'Tasa', v: data.tasa+'%', c: data.tasa>=30?G:data.tasa>=15?A:R },
          { l:'Promotores', v: data.promotores+' ('+pPct+'%)', c: G },
          { l:'Pasivos', v: data.pasivos+' ('+paPct+'%)', c: A },
          { l:'Detractores', v: data.detractores+' ('+dPct+'%)', c: R },
        ].map(k => `<td style="text-align:center;padding:0 4px;">
          <p style="margin:0;font-size:10px;color:#9ca3af;">${k.l}</p>
          <p style="margin:2px 0 0;font-size:15px;font-weight:700;color:${k.c};">${k.v}</p>
        </td>`).join('')}
      </tr>
    </table>
  </td></tr>

  <!-- Dimensions -->
  <tr><td style="padding:0 28px 24px;">
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;">Dimensiones promedio</p>
    <table width="100%" cellpadding="0" cellspacing="0">${dimRows}</table>
  </td></tr>

  <!-- Acumulado -->
  <tr><td style="background:#f9fafb;padding:14px 28px;border-top:1px solid #f3f4f6;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;">Histórico acumulado</td>
      ${[
        { l:'NPS', v: (data.npsAcum>0?'+':'')+data.npsAcum, c: data.npsAcum>=50?G:data.npsAcum>=0?A:R },
        { l:'Tasa', v: data.tasaAcum+'%', c: data.tasaAcum>=30?G:data.tasaAcum>=15?A:R },
        { l:'Total', v: data.totalAcum, c:'#374151' },
      ].map(k=>`<td style="text-align:center;">
        <p style="margin:0;font-size:10px;color:#9ca3af;">${k.l}</p>
        <p style="margin:2px 0 0;font-size:14px;font-weight:700;color:${k.c};">${k.v}</p>
      </td>`).join('')}
    </tr></table>
  </td></tr>

  ${topAspectos ? `
  <!-- Aspectos -->
  <tr><td style="padding:20px 28px 0;">
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;">Aspectos a mejorar (acumulado)</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #f3f4f6;">${topAspectos}</table>
  </td></tr>` : ''}

  ${comentRows ? `
  <!-- Comentarios -->
  <tr><td style="padding:20px 28px 0;">
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;">Comentarios del período</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #f3f4f6;">
      <tr style="background:${P};">
        <th style="padding:6px 8px;text-align:left;color:#fff;font-size:10px;font-weight:600;">Clasif.</th>
        <th style="padding:6px 8px;text-align:left;color:#fff;font-size:10px;font-weight:600;">★</th>
        <th style="padding:6px 8px;text-align:left;color:#fff;font-size:10px;font-weight:600;">Sucursal</th>
        <th style="padding:6px 8px;text-align:left;color:#fff;font-size:10px;font-weight:600;">Comentario</th>
      </tr>
      ${comentRows}
    </table>
  </td></tr>` : ''}

  <!-- CTA -->
  <tr><td style="padding:24px 28px;text-align:center;">
    <a href="${data.reportUrl}" style="display:inline-block;padding:12px 28px;background:${P};color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Ver reporte completo en PDF →</a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #f3f4f6;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">Club UAA · NPS Dashboard · encuesta.clubuaa.ar</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ─── Route handler ─── */
export async function GET(req: Request) {
  // Verify cron secret
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const anchor = getDefaultAnchor();
    const period = getPeriod(anchor);
    const pool = await getPool();

    // Fetch responses
    const reqEnv = pool.request();
    period.dates.forEach((d, i) => reqEnv.input(`d${i}`, d));
    const ph = period.dates.map((_, i) => `@d${i}`).join(', ');

    const [npsRes, envTotalRes, envPeriodRes, [sucRes]] = await Promise.all([
      pool.request().query(`SELECT score, clasificacion, comentario, cliente_id, ticket_id, respondido_at,
        score_experiencia, score_productos, score_precios, score_atencion, aspectos_mejorar
        FROM nps_respuestas ORDER BY respondido_at DESC`),
      pool.request().query(`SELECT COUNT(*) AS n FROM nps_enviar WHERE fh_enviometa IS NOT NULL`),
      reqEnv.query(`SELECT COUNT(*) AS n FROM nps_enviar WHERE fh_enviometa IS NOT NULL AND CAST(fh_enviometa AS DATE) IN (${ph})`),
      mysqlPool.query<RowDataPacket[]>(`SELECT CAST(C_SUCURSAL AS CHAR) AS code, X_SUCURSAL AS name FROM ref_sucursal`),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allRaw: any[] = npsRes.recordset;
    const envTotal  = Number(envTotalRes.recordset[0]?.n ?? 0);
    const envPeriod = Number(envPeriodRes.recordset[0]?.n ?? 0);
    const sucMap    = new Map((sucRes as RowDataPacket[]).map(r => [normCode(String(r.code))!, String(r.name).trim()]));

    // MySQL enrichment for sucursal names
    const ticketIds = [...new Set<number>(allRaw.filter(r => r.ticket_id > 0).map(r => Number(r.ticket_id)))];
    const sucByTicket = new Map<number, string>();
    if (ticketIds.length > 0) {
      try {
        const ph2 = ticketIds.map(() => '?').join(',');
        interface MR extends RowDataPacket { ticket_id: number; c_sucursal: string | null }
        const [rows] = await mysqlPool.query<MR[]>(
          `SELECT c_idticket AS ticket_id, CAST(c_sucursal AS CHAR) AS c_sucursal FROM ticket_super WHERE c_idticket IN (${ph2})`,
          ticketIds
        );
        for (const m of rows) {
          const cs = normCode(m.c_sucursal);
          if (cs) sucByTicket.set(Number(m.ticket_id), sucMap.get(cs) ?? cs);
        }
      } catch { /* ignore */ }
    }

    const periodSet = new Set(period.dates);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toRow = (r: any) => ({
      score:            Number(r.score),
      clasificacion:    String(r.clasificacion),
      comentario:       r.comentario as string|null,
      cliente_id:       Number(r.cliente_id),
      ticket_id:        Number(r.ticket_id),
      respondido_at:    (r.respondido_at instanceof Date ? r.respondido_at : new Date(String(r.respondido_at))).toISOString(),
      score_experiencia: r.score_experiencia != null ? Number(r.score_experiencia) : null,
      score_productos:   r.score_productos   != null ? Number(r.score_productos)   : null,
      score_precios:     r.score_precios     != null ? Number(r.score_precios)     : null,
      score_atencion:    r.score_atencion    != null ? Number(r.score_atencion)    : null,
      aspectos_mejorar: r.aspectos_mejorar as string|null,
    });

    const allRows = allRaw.map(toRow);
    const periodRows = allRows.filter(r => periodSet.has(dateKey(r.respondido_at)));

    const calc = (rows: typeof allRows) => {
      let p = 0, pa = 0, d = 0;
      for (const r of rows) {
        if (r.clasificacion === 'promotor') p++;
        else if (r.clasificacion === 'pasivo') pa++;
        else if (r.clasificacion === 'detractor') d++;
      }
      const n = rows.length;
      return { total: n, promotores: p, pasivos: pa, detractores: d,
        nps: n > 0 ? Math.round(((p-d)/n)*100) : 0,
        avgExp:  avg(rows.map(r=>r.score_experiencia)),
        avgProd: avg(rows.map(r=>r.score_productos)),
        avgPrec: avg(rows.map(r=>r.score_precios)),
        avgAten: avg(rows.map(r=>r.score_atencion)),
      };
    };

    const pm = calc(periodRows);
    const am = calc(allRows);
    const tasa = envPeriod > 0 ? Math.round((periodRows.filter(r=>r.cliente_id>0).length/envPeriod)*100) : 0;
    const tasaAcum = envTotal > 0 ? Math.round((allRows.filter(r=>r.cliente_id>0).length/envTotal)*100) : 0;

    const aspectosMap: Record<string, number> = {};
    for (const r of allRows) {
      if (!r.aspectos_mejorar) continue;
      for (const a of r.aspectos_mejorar.split(',')) { const t=a.trim(); if(t) aspectosMap[t]=(aspectosMap[t]??0)+1; }
    }
    const aspectos = Object.entries(aspectosMap)
      .map(([a,n])=>({ a, n, pct: am.total>0?Math.round((n/am.total)*100):0 }))
      .sort((x,y)=>y.n-x.n);

    const comentarios = periodRows
      .filter(r => r.comentario?.trim())
      .sort((a,b) => a.score - b.score)
      .map(r => ({
        clasificacion: r.clasificacion,
        score: r.score,
        sucursal: r.ticket_id > 0 ? (sucByTicket.get(r.ticket_id) ?? null) : null,
        comentario: r.comentario!,
      }));

    const reportUrl = `https://encuesta.clubuaa.ar/dashboard/reporte?fecha=${anchor}`;

    const html = buildEmail({
      period, reportUrl,
      nps: pm.nps, total: pm.total, promotores: pm.promotores, pasivos: pm.pasivos, detractores: pm.detractores,
      tasa, enviados: envPeriod,
      avgExp: pm.avgExp, avgProd: pm.avgProd, avgPrec: pm.avgPrec, avgAten: pm.avgAten,
      npsAcum: am.nps, totalAcum: am.total, tasaAcum,
      aspectos, comentarios,
    });

    const subject = `NPS ${period.rangeLabel} — Score: ${pm.nps > 0 ? '+' : ''}${pm.nps} | ${pm.total} respuestas`;

    // Devuelve HTML + metadatos para que n8n envíe el email
    return NextResponse.json({
      ok: true,
      subject,
      html,
      period: period.rangeLabel,
      nps: pm.nps,
      total: pm.total,
      tasa,
    });
  } catch (e) {
    console.error('[cron/report]', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
