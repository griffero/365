# 365 / year-dots — Year Progress

App estática (sin backend) hecha con **Vue 3 + Vite + Tailwind** que muestra el **progreso del año** como una grilla de puntos (un punto por día) y permite exportar una imagen **1080×1920 tipo “Story”**.

## Endpoint para automatización (n8n)

Se agregó un servidor Node con un endpoint que **genera un PNG on-demand**:

- `GET /generate` → **Story 1080×1920** (default)
- `GET /generate?format=square` → **1080×1080** (feed)
- `GET /generate?format=wide` → **1200×630**
- (opcional) `tz=America/Santiago` para calcular el día en ese huso horario

Ejemplos:

```bash
curl -L "http://localhost:5173/generate?format=story&tz=America/Santiago" --output story.png
curl -L "http://localhost:5173/generate?format=square&tz=America/Santiago" --output square.png
```

En n8n, el primer `HTTP Request` debe apuntar a esa URL y descargarla como binario.

## Qué hace

- **Calcula el año actual** (en tu zona horaria local).
- **Determina si el año es bisiesto** para usar 365 o 366 días.
- **Calcula el “día del año”** usando fechas a medianoche local para evitar edge cases de DST/timezone.
- **Renderiza una grilla de puntos**:
  - Total de puntos = días del año (365/366).
  - Puntos rellenos = días transcurridos (clamp al total).
  - Layout de UI: **19 columnas** y filas automáticas.
- **Exporta un PNG para Stories**:
  - Render en Canvas a **1080×1920** con padding “safe area”.
  - Intenta compartir vía **Share Sheet** (`navigator.share`) si está disponible.
  - Si no, descarga el archivo localmente.
- **Genera la imagen Open Graph** `public/og.png` en build (1200×630) para previews al compartir el link.

## Stack

- **Vue**: UI reactiva.
- **Vite**: dev server + build.
- **TailwindCSS**: estilos.
- **TypeScript**: tipado (app y utilidades).

## Estructura del repo

- `index.html`: meta tags (OG/Twitter) + mount del app.
- `src/main.ts`: bootstrap de Vue.
- `src/App.vue`: lógica de año/día y UI (grilla + botón export).
- `src/utils/exportStoryPng.ts`: export de story 1080×1920 (Canvas + share/download).
- `scripts/generate-og.mjs`: genera `public/og.png` (OG image 1200×630) durante el build.
- `public/og.png`: imagen OG generada.
- `public/favicon.svg`: favicon.

## Cómo correrlo

Instalar dependencias:

```bash
npm install
```

Dev server:

```bash
npm run dev
```

Dev server + endpoint `/generate`:

```bash
npm run dev:server
```

Build (genera `public/og.png` y luego buildea Vite):

```bash
npm run build
```

Preview del build:

```bash
npm run preview
```

Servidor de producción (sirve `dist/` + `/generate`):

```bash
npm run build
npm run start
```

## Cómo se calcula el progreso del año

En `src/App.vue`:

- **Bisiesto**:
  - \( \text{leap} = (y \bmod 4 = 0 \land y \bmod 100 \ne 0) \lor (y \bmod 400 = 0) \)
- **Total**: 365/366.
- **Día del año**: usa `new Date(year, month, day)` (medianoche local) para evitar problemas de DST.
- **filledCount**: `min(dayOfYear(today), totalDays)`.
- **Porcentaje**: `((filledCount/totalDays)*100).toFixed(1)`.

## Export “Story” (PNG 1080×1920)

Al apretar el botón, `src/App.vue` llama a:

- `exportStoryPng({ totalDays, filledCount, year, yearPercent, title })`

En `src/utils/exportStoryPng.ts` se:

- Crea un canvas 2D de **1080×1920**.
- Dibuja:
  - Fondo negro
  - Header (título + stats)
  - Grilla de puntos (stroke siempre, fill para los “completed”)
  - Footer `${year} • Local time`
- Exporta con `canvas.toBlob('image/png')`.
- **Comparte** usando `navigator.share({ files })` cuando existe (ideal iOS).
- Si falla/no existe, hace **download** del blob.

### Safe area

El export usa un safe area generoso para no chocar con UI típica de Stories:

- `src/utils/exportStoryPng.ts` → `DEFAULT_SAFE_AREA`

## Open Graph / previews al compartir

`index.html` define OG/Twitter meta tags y referencia `/og.png`.

El build ejecuta:

- `node scripts/generate-og.mjs && vite build`

`scripts/generate-og.mjs` genera `public/og.png` (1200×630) con:

- El texto grande `filled/total` y `%`
- Una grilla de puntos para el año (en OG usa **37 columnas** para que quepa bien en 1200×630)

## Deploy

Es un sitio estático: se puede subir a cualquier hosting estático (Render Static, Netlify, Vercel, Cloudflare Pages, etc.).

**Importante**: en `index.html` el `og:url` está hardcodeado; actualizalo al dominio real de tu deploy.

## Customización rápida

- **Cambiar columnas de la grilla (UI)**: `src/App.vue` (grid `repeat(19, ...)`)
- **Cambiar columnas de la grilla (export Story)**: `src/utils/exportStoryPng.ts` (`const cols = 19`)
- **Cambiar columnas OG**: `scripts/generate-og.mjs` (`const cols = 37`)
- **Cambiar título**:
  - UI: `src/App.vue`
  - Export: `src/App.vue` → `exportStoryPng({ title: '...' })`


