# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # desarrollo local en localhost:3000
npm run build    # build de producción (verifica tipos TypeScript)
npm start        # servidor de producción local
```

**Deploy a Vercel** (no hay CI automático vía CLI — el push a `main` dispara el GitHub Action):
```bash
vercel --token $VERCEL_TOKEN --prod --yes
```

## Arquitectura

Next.js 15 App Router desplegado en Vercel. Sin ORM — usa `pg` (node-postgres) directamente en Server Components y API Routes.

### Flujo de datos

```
n8n (diario)
  → genera token UUID → INSERT nps_enviados (PostgreSQL)
  → envía email con link https://nps-clubuaa.vercel.app/r/{token}

Usuario abre el link
  → app/r/[token]/page.tsx  (Server Component)
      → valida token contra nps_enviados en PostgreSQL
      → si ok: renderiza SurveyForm (Client Component)
      → si no: muestra pantalla de estado (inválido / expirado / ya respondido)

Usuario envía el formulario
  → POST /api/respuesta
      → valida token nuevamente
      → INSERT nps_respuestas
      → UPDATE nps_enviados SET respondido = TRUE
      → redirect a /gracias
```

### Base de datos (PostgreSQL — supermercadopbi.duckdns.org:5432, db: supermercado)

**`nps_enviados`** — registros de envíos generados por n8n:
- `token VARCHAR(64) UNIQUE` — UUID sin guiones, 32 chars
- `cliente_id`, `ticket_id`, `canal`, `expira_at`, `respondido`, `abierto`

**`nps_respuestas`** — respuestas guardadas por el API:
- `score SMALLINT` — Q1 recomendación (1-5), determina `clasificacion`
- `score_experiencia`, `score_productos`, `score_precios`, `score_atencion` — Q2-Q5 (1-5)
- `aspectos_mejorar TEXT` — Q6, opciones separadas por coma
- `comentario TEXT` — Q7, texto libre
- `clasificacion VARCHAR(20)` — `promotor` (4-5) / `pasivo` (3) / `detractor` (1-2)

### Tokens de prueba (no consultan DB)

- `/r/test-invalido` → pantalla link inválido
- `/r/test-respondido` → pantalla ya respondido
- `/r/test-demo` → formulario completo en modo demo (no guarda)

### Conexión PostgreSQL

Ambos archivos que usan `pg` deben incluir `ssl: { rejectUnauthorized: false }` — requerido por Vercel:

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
```

### Variables de entorno

```
DATABASE_URL=postgresql://etl_user:...@supermercadopbi.duckdns.org:5432/supermercado
```
En Vercel está seteada como encrypted. Localmente usar `.env.local` (no commitear).

### Deploy

Push a `main` → GitHub Action (`.github/workflows/deploy.yml`) → `vercel --prod`.
Los secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` están en GitHub Actions secrets del repo `supermercadouaa/nps-clubuaa`.
