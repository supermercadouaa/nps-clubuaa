# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # desarrollo local en localhost:3000
npm run build    # build de producción (verifica tipos TypeScript)
npm start        # servidor de producción local
```

**Deploy:** push a `main` → GitHub Action (`.github/workflows/deploy.yml`) → `vercel --prod`.  
Secrets en GitHub Actions del repo `supermercadouaa/nps-clubuaa`: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

## Arquitectura

Next.js 15 App Router en Vercel. Sin ORM — `pg` (node-postgres) directo en Server Components y API Routes. No hay tests.

### Flujo de datos

```
n8n (cron 8am)
  → MySQL: ticket_super JOIN cliente_clubuaa → clientes con ticket de ayer + x_telcelular
  → PostgreSQL: nps_enviados → excluidos últimos 90 días
  → Code: filtra, genera token UUID + link → https://encuesta.clubuaa.ar/r/{token}
  → PostgreSQL: INSERT nps_enviados (canal='whatsapp')
  → WhatsApp API (Meta): envía template nps_encuesta con nombre + link

Usuario abre el link
  → app/r/[token]/page.tsx (Server Component)
      → tokens especiales: cortocircuitan antes de tocar DB (ver abajo)
      → tokens reales: valida contra nps_enviados (respondido, expira_at)

Usuario envía el formulario
  → POST /api/respuesta
      → token 'abcdaddf130814': inserta directo con cliente_id=0, ticket_id=0 (sin validar nps_enviados)
      → tokens reales: INSERT nps_respuestas + UPDATE nps_enviados SET respondido=TRUE (BEGIN/COMMIT)
```

### Base de datos (PostgreSQL — supermercadopbi.duckdns.org:5432, db: supermercado)

**`nps_enviados`** — un registro por envío generado por n8n:
- `token VARCHAR(64) UNIQUE`, `cliente_id`, `ticket_id`, `canal` (`whatsapp`/`email`)
- `expira_at TIMESTAMP`, `respondido BOOLEAN`, `abierto BOOLEAN`, `abierto_at`

**`nps_respuestas`** — una fila por respuesta recibida:
- `score SMALLINT` — Q1 recomendación (1–5), define `clasificacion`
- `score_experiencia`, `score_productos`, `score_precios`, `score_atencion` — Q2–Q5 (1–5)
- `aspectos_mejorar TEXT` — Q6, opciones separadas por coma
- `comentario TEXT` — Q7 libre
- `clasificacion`: `detractor` (1–2) / `pasivo` (3) / `promotor` (4–5)
- Respuestas del token público tienen `cliente_id=0` y `ticket_id=0`

**NPS Score** = `((promotores − detractores) / total) × 100` → rango −100 a +100.

### Tokens especiales (hardcodeados en page.tsx, no tocan DB)

| Token | Comportamiento |
|---|---|
| `test-invalido` | Pantalla "link inválido" |
| `test-respondido` | Pantalla "ya respondiste" |
| `test-demo` | Formulario completo, **no guarda** (modo demo visual) |
| `abcdaddf130814` | Formulario real, **sí guarda** en nps_respuestas con cliente_id=0 |

### Reglas de implementación críticas

- Todo archivo que use `pg` debe incluir `ssl: { rejectUnauthorized: false }` (requerido por Vercel).
- El dashboard (`app/dashboard/page.tsx`) necesita `export const dynamic = 'force-dynamic'` para no ser cacheado y mostrar datos en tiempo real.
- `router.refresh()` en el Client Component `AutoRefresh.tsx` es lo que dispara el re-fetch del Server Component.

### Variables de entorno

```
DATABASE_URL=postgresql://etl_user:...@supermercadopbi.duckdns.org:5432/supermercado
```
En Vercel está seteada como encrypted. Localmente usar `.env.local`.

### n8n (https://n8n.srvs.uaa.com.ar)

Dos workflows activos:
- **NPS — Envio Diario** (`bqVtSDbr86azhHjY`) — cron 8am, hasta 100 clientes por día
- **NPS — Envio Diario (DEMO)** (`4w5VZmvVdbeQ9i13`) — manual, clientes fijos 122797 y 118922

Ambos usan credencial MySQL `VjA2xhrozDNhr2RW` (ticket_super + cliente_clubuaa) y credencial Postgres `k6dkO6SuVAJgqwHd`. La API key de n8n se guarda fuera del repo.
