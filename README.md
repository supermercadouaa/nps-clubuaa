# Dashboard NPS — Club UAA

Sistema completo de encuestas NPS (Net Promoter Score) para Supermercados UAA. Incluye envío automatizado por WhatsApp, formulario de respuesta y dashboard de análisis restringido.

**URL producción:** https://encuesta.clubuaa.ar  
**Dashboard:** https://encuesta.clubuaa.ar/dashboard  
**Repo:** github.com/supermercadouaa/nps-clubuaa

---

## Índice

1. [Arquitectura general](#1-arquitectura-general)
2. [Bases de datos](#2-bases-de-datos)
3. [Flujo completo de una encuesta](#3-flujo-completo-de-una-encuesta)
4. [Estructura de archivos](#4-estructura-de-archivos)
5. [Variables de entorno](#5-variables-de-entorno)
6. [Desarrollo local](#6-desarrollo-local)
7. [Deploy](#7-deploy)
8. [Dashboard — funcionalidades](#8-dashboard--funcionalidades)
9. [Seguridad](#9-seguridad)
10. [n8n — workflows de envío](#10-n8n--workflows-de-envío)
11. [Tokens especiales de prueba](#11-tokens-especiales-de-prueba)
12. [Fórmula NPS](#12-fórmula-nps)

---

## 1. Arquitectura general

```
Next.js 15 (App Router) en Vercel
    ├── Formulario público      → /r/[token]
    ├── API de respuesta        → /api/respuesta
    ├── Dashboard interno       → /dashboard
    └── Autenticación           → /api/auth/login, /api/auth/logout
```

**Stack:**
- **Framework:** Next.js 15 con App Router
- **UI:** Tailwind CSS + shadcn/ui (componentes: Card, Table, Select, Tabs, Badge)
- **SQL Server:** `mssql` — tablas NPS (`nps_respuestas`, `nps_enviados`, `nps_enviar`)
- **MySQL:** `mysql2/promise` — datos de tickets y sucursales (`ticket_super`, `cliente_clubuaa`, `ref_sucursal`)
- **PostgreSQL:** `pg` (node-postgres) — logs de acceso al dashboard (`nps_dashboard_logs`)
- **Hosting:** Vercel (plan Pro)

**Patrón servidor/cliente en el dashboard:**
El `page.tsx` es un Server Component que corre una sola vez al cargar la página, trae todos los datos y los pasa al `DashboardClient.tsx`. Todo el filtrado (por sucursal, por fecha, búsqueda) ocurre en el cliente con `useState` + `useMemo` — sin nuevas llamadas al servidor, sin latencia.

---

## 2. Bases de datos

### SQL Server — tablas NPS

**`nps_enviados`** — un registro por envío generado por n8n:

| Columna | Tipo | Descripción |
|---|---|---|
| `token` | VARCHAR(64) UNIQUE | UUID del link de encuesta |
| `cliente_id` | INT | ID del cliente en MySQL |
| `ticket_id` | INT | ID del ticket de compra en MySQL |
| `canal` | VARCHAR | `'whatsapp'` |
| `expira_at` | DATETIME | 7 días desde el envío |
| `respondido` | BIT | 1 si ya respondió |
| `fh_enviometa` | DATETIME | Timestamp de envío efectivo por WhatsApp |

**`nps_respuestas`** — una fila por respuesta recibida:

| Columna | Tipo | Descripción |
|---|---|---|
| `token` | VARCHAR(64) | Referencia al envío |
| `cliente_id` | INT | 0 si es respuesta de token público |
| `ticket_id` | INT | 0 si es respuesta de token público |
| `score` | SMALLINT | Q1: recomendación 1–5 |
| `clasificacion` | VARCHAR | `detractor` / `pasivo` / `promotor` |
| `canal` | VARCHAR | Canal de envío |
| `score_experiencia` | SMALLINT | Q2: experiencia general 1–5 |
| `score_productos` | SMALLINT | Q3: calidad de productos 1–5 |
| `score_precios` | SMALLINT | Q4: precios 1–5 |
| `score_atencion` | SMALLINT | Q5: atención al cliente 1–5 |
| `aspectos_mejorar` | TEXT | Q6: opciones separadas por coma |
| `comentario` | TEXT | Q7: comentario libre |
| `respondido_at` | DATETIME | Fecha/hora de la respuesta (Argentina UTC-3) |

**`nps_enviar`** — cola de envíos pendientes (usada por n8n):

| Columna relevante | Descripción |
|---|---|
| `fh_enviometa` | NULL = pendiente, NOT NULL = enviado por WhatsApp |

### MySQL — datos del negocio

**`ticket_super`** — tickets de compra:
- `c_idticket`: ID del ticket
- `fechacorta`: fecha de compra
- `horaticket`: hora de compra
- `c_sucursal`: código de sucursal (INT, puede ser 0 para Casa Central)
- `n_codcliente`: código de cliente

**`cliente_clubuaa`** — clientes del programa de fidelidad:
- `c_cliente`: código de cliente
- `x_nombres`, `x_apellidocli`: nombre y apellido
- `x_telcelular`: teléfono celular

**`ref_sucursal`** — catálogo de sucursales:
- `C_SUCURSAL`: código de sucursal (puede tener ceros a la izquierda)
- `X_SUCURSAL`: nombre de la sucursal

> **Nota de normalización de códigos:** Los códigos de sucursal en `ticket_super` (INT) y `ref_sucursal` (CHAR) pueden diferir en ceros a la izquierda. El dashboard usa `normCode()` para estandarizar: `'0'`, `'00'`, `'000'` → `'0'`, garantizando que Casa Central (código 0) siempre aparezca.

### PostgreSQL — logs del dashboard

**`nps_dashboard_logs`** — auditoría de accesos:
- `email`, `accion` (`login`/`logout`), `ip`, `created_at`

---

## 3. Flujo completo de una encuesta

```
1. n8n (cron 8:00 AM todos los días)
   ├── MySQL: consulta ticket_super + cliente_clubuaa
   │         → clientes con ticket del día anterior que tienen celular
   ├── SQL Server: consulta nps_enviados
   │         → excluye clientes que recibieron encuesta en los últimos 90 días
   ├── Genera token UUID + link: https://encuesta.clubuaa.ar/r/{token}
   ├── SQL Server: INSERT INTO nps_enviados
   └── WhatsApp API (Meta): envía template "nps_encuesta" con nombre + link

2. Cliente recibe el WhatsApp y toca el link
   └── GET /r/{token}
       ├── Valida token en nps_enviados (existencia, respondido, expirado)
       └── Muestra formulario o pantalla de estado

3. Cliente completa el formulario (7 preguntas)
   └── POST /api/respuesta { token, q1..q5, aspectos, comentario }
       ├── INSERT INTO nps_respuestas
       ├── UPDATE nps_enviados SET respondido = 1
       └── Redirige a /gracias

4. Dashboard (uso interno)
   └── GET /dashboard
       ├── Middleware verifica sesión (edge, HMAC-SHA256)
       ├── Server Component: SQL Server + MySQL en paralelo
       └── Client Component: filtros instantáneos por sucursal, fecha, búsqueda
```

---

## 4. Estructura de archivos

```
nps-form/
├── app/
│   ├── layout.tsx                      # Layout raíz (HTML, fuente Inter)
│   ├── globals.css                     # Variables CSS shadcn + estilos base
│   ├── gracias/
│   │   └── page.tsx                    # Pantalla post-respuesta
│   ├── r/[token]/
│   │   ├── page.tsx                    # Server Component — valida token y muestra estado
│   │   └── SurveyForm.tsx              # Client Component — formulario de 7 preguntas
│   ├── api/
│   │   ├── respuesta/route.ts          # POST — guarda respuesta en nps_respuestas
│   │   └── auth/
│   │       ├── login/route.ts          # POST — valida credenciales, emite cookie sesión
│   │       └── logout/route.ts         # POST — borra cookie sesión, registra logout
│   └── dashboard/
│       ├── page.tsx                    # Server Component — fetch de datos, protegido por sesión
│       ├── DashboardClient.tsx         # Client Component — toda la UI y el filtrado
│       ├── LogoutButton.tsx            # Client Component — botón de cierre de sesión
│       ├── login/page.tsx              # Formulario de login del dashboard
│       └── AutoRefresh.tsx             # (legacy) Client Component de auto-refresh
├── lib/
│   ├── auth.ts                         # Sesiones HMAC-SHA256, allowlist de emails
│   ├── mssql.ts                        # Pool de conexión SQL Server (singleton)
│   ├── mysql.ts                        # Pool de conexión MySQL (mysql2/promise)
│   └── utils.ts                        # cn() de shadcn (clsx + tailwind-merge)
├── components/ui/
│   ├── card.tsx                        # shadcn Card
│   ├── table.tsx                       # shadcn Table
│   ├── select.tsx                      # shadcn Select
│   ├── tabs.tsx                        # shadcn Tabs
│   └── badge.tsx                       # shadcn Badge
├── middleware.ts                       # Edge middleware — protege /dashboard/*
├── tailwind.config.ts                  # Tokens de color shadcn + fuente Inter
├── .env.example                        # Variables de entorno requeridas
├── CLAUDE.md                           # Instrucciones para Claude Code
└── .github/workflows/deploy.yml        # CI/CD → Vercel
```

---

## 5. Variables de entorno

Crear `.env.local` para desarrollo local basándose en `.env.example`:

```env
# SQL Server — nps_respuestas, nps_enviados, nps_enviar
MSSQL_SERVER=<host o IP>
MSSQL_DATABASE=<nombre de la base>
MSSQL_USER=<usuario>
MSSQL_PASSWORD=<contraseña>
MSSQL_PORT=1433

# MySQL — ticket_super, cliente_clubuaa, ref_sucursal
MYSQL_HOST=186.148.233.111
MYSQL_PORT=3306
MYSQL_DB=mysql_web
MYSQL_USER=usersuper
MYSQL_PASSWORD=<contraseña>

# PostgreSQL — logs de acceso al dashboard
DATABASE_URL=postgresql://etl_user:<pass>@supermercadopbi.duckdns.org:5432/supermercado

# Auth dashboard
AUTH_SECRET=<cadena aleatoria de 64 hex chars — generá con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
AUTH_PASSWORD=<contraseña del dashboard>
```

Todas están configuradas en Vercel como variables encriptadas. `AUTH_SECRET` y `AUTH_PASSWORD` son **obligatorias** — la app lanza error en startup si no están definidas.

---

## 6. Desarrollo local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
# editar .env.local con los valores reales

# 3. Levantar servidor de desarrollo
npm run dev
# → http://localhost:3000

# 4. Verificar build de producción (chequea tipos TypeScript)
npm run build
```

---

## 7. Deploy

El deploy es completamente automático:

```
git push origin main
    └── GitHub Actions (.github/workflows/deploy.yml)
            └── npx vercel --prod
                    → Vercel (proyecto nps-clubuaa)
                            → https://encuesta.clubuaa.ar
```

**Secretos en GitHub Actions del repo `supermercadouaa/nps-clubuaa`:**
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID` (`prj_SmBxWnL8tSMk7DnBTocZl7xyWVb2`)

No hacer push directo a Vercel. El deploy siempre pasa por GitHub Actions.

---

## 8. Dashboard — funcionalidades

Acceso restringido a emails autorizados (ver [Seguridad](#9-seguridad)).

### KPIs (tarjetas en la parte superior)

| Tarjeta | Qué mide |
|---|---|
| **Total** | Cantidad total de respuestas en el filtro activo |
| **Promotores** | Score 4–5 (clasificacion = `promotor`) |
| **Pasivos** | Score 3 (clasificacion = `pasivo`) |
| **Detractores** | Score 1–2 (clasificacion = `detractor`) |
| **Tasa de respuesta** | Respuestas reales / mensajes enviados (nps_enviar con fh_enviometa IS NOT NULL) |

### Filtros (client-side, instantáneos)

- **Sucursal:** dropdown con todas las sucursales que tienen datos. "Todas" muestra el consolidado.
- **Fecha:** selector de días con formato `02/07/2026 - Jueves`. Al cambiar la sucursal el filtro de fecha se resetea.

### Tabs

**Resumen:**
- Score NPS global y promedio de las 4 dimensiones (Experiencia, Productos, Precios, Atención)
- Distribución de clasificaciones con barras de progreso
- Aspectos a mejorar con conteo y porcentaje sobre el total de respuestas

**Por Sucursal:**
- Tabla con: sucursal, respuestas, NPS, score promedio, Experiencia, Productos, Precios, Atención

**Comentarios:**
- Todos los comentarios no vacíos con: cliente, sucursal, fecha de compra, fecha de respuesta, score
- Buscador por palabra clave (filtra por comentario, nombre del cliente o nombre de sucursal; resalta coincidencias en amarillo)

### Enriquecimiento cross-base

El dashboard cruza datos de tres orígenes:

```
SQL Server: nps_respuestas (score, fechas, dimensiones)
    ↓ ticket_id
MySQL: ticket_super (fecha/hora de compra, código de sucursal)
    ↓ n_codcliente → cliente_clubuaa (nombre del cliente)
    ↓ c_sucursal → ref_sucursal (nombre de la sucursal)
```

El join se hace en JavaScript (no en SQL) para evitar problemas de tipos entre bases.

---

## 9. Seguridad

### Acceso al dashboard

Solo pueden acceder:
- `vmalmiron@uaa.com.ar`
- `ndellarosa@uaa.com.ar`

Cualquier otro email o contraseña incorrecta → 401 con mensaje genérico.

### Capas de protección

| Capa | Implementación |
|---|---|
| **Middleware edge** | `middleware.ts` — verifica HMAC + expiración + allowlist antes de servir cualquier ruta `/dashboard/*`. Usa Web Crypto API (compatible con edge runtime). |
| **Server Component** | `app/dashboard/page.tsx` — verifica sesión nuevamente en Node.js antes de hacer queries. |
| **Sesiones** | Tokens HMAC-SHA256 firmados con `AUTH_SECRET`. Sin base de datos de sesiones — la validez se verifica matemáticamente. Expiración: 8 horas. |
| **Cookie** | `httpOnly: true`, `secure: true`, `sameSite: strict`, `maxAge: 8h`. Inaccesible desde JavaScript del navegador. |
| **Rate limiting** | Máximo 5 intentos de login por IP en ventanas de 15 minutos → 429. |
| **Contraseña** | Comparación con `timingSafeEqual` para evitar timing attacks. Guardada en `AUTH_PASSWORD` (env var, nunca en el repo). |
| **Secret** | `AUTH_SECRET` sin fallback hardcodeado — la app no arranca sin él. 256 bits aleatorios. |
| **Logs** | Cada login y logout queda registrado en `nps_dashboard_logs` (PostgreSQL) con email, acción e IP. |

### Generar un nuevo AUTH_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Actualizar en Vercel: Dashboard → nps-clubuaa → Settings → Environment Variables.

---

## 10. n8n — workflows de envío

**URL n8n:** https://n8n.srvs.uaa.com.ar

| Workflow | ID | Trigger | Descripción |
|---|---|---|---|
| NPS — Envio Diario | `bqVtSDbr86azhHjY` | Cron 8:00 AM | Hasta 100 clientes por día |
| NPS — Envio Diario (DEMO) | `4w5VZmvVdbeQ9i13` | Manual | Solo clientes fijos 122797 y 118922 |

**Credenciales usadas por n8n:**
- MySQL `VjA2xhrozDNhr2RW` → ticket_super + cliente_clubuaa
- PostgreSQL `k6dkO6SuVAJgqwHd` → nps_enviados

**Lógica de selección de clientes:**
1. MySQL: clientes con ticket del día anterior + celular registrado
2. SQL Server: excluir clientes que recibieron encuesta en los últimos 90 días
3. Generar token UUID, armar link, insertar en `nps_enviados`, enviar por WhatsApp API (Meta)
4. Actualizar `nps_enviar.fh_enviometa` con timestamp de envío efectivo

---

## 11. Tokens especiales de prueba

No consultan la base de datos y funcionan siempre:

| Token | URL | Comportamiento |
|---|---|---|
| `test-invalido` | `/r/test-invalido` | Pantalla "link inválido" |
| `test-respondido` | `/r/test-respondido` | Pantalla "ya respondiste" |
| `test-demo` | `/r/test-demo` | Formulario completo — **no guarda** nada |
| `test-demo-habilitado` | `/r/test-demo-habilitado` | Formulario completo — **sí guarda** en nps_respuestas con cliente_id=0 y ticket_id=0 |

---

## 12. Fórmula NPS

```
NPS = ((Promotores - Detractores) / Total) × 100
```

| Score Q1 | Clasificación |
|---|---|
| 1–2 | Detractor |
| 3 | Pasivo |
| 4–5 | Promotor |

Rango: −100 (todos detractores) a +100 (todos promotores).

Las 4 dimensiones (Q2–Q5: Experiencia, Productos, Precios, Atención) se reportan como promedio simple en escala 1–5.
