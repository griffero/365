import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { computeYearProgress } from './scripts/png-lib.mjs'
import { renderPostSquarePngBuffer, renderStoryPngBuffer as renderUiStoryPngBuffer, renderUiPngBuffer } from './scripts/ui-render.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname)

const isProd = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT || (isProd ? 4173 : 5173))

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...headers })
  res.end(body)
}

function notFound(res) {
  send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' })
}

function parseUrl(req) {
  const host = req.headers.host || `localhost:${port}`
  return new URL(req.url || '/', `http://${host}`)
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.json':
      return 'application/json; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

async function handleGenerate(req, res) {
  if (req.method !== 'GET') {
    send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain; charset=utf-8' })
    return
  }

  const url = parseUrl(req)

  // format=square (1080x1080) [default] | story (1080x1920)
  const format = (url.searchParams.get('format') || 'square').toLowerCase()
  const timeZone = url.searchParams.get('tz') || undefined

  const { year, total, filled, percent } = computeYearProgress({ timeZone })

  let png
  let filename

  if (format === 'story') {
    png = renderUiStoryPngBuffer({ year, filled, total, percent })
    filename = `year-dots-${year}-story.png`
  } else if (format === 'square') {
    png = renderPostSquarePngBuffer({ year, filled, total, percent })
    filename = `year-dots-${year}-square.png`
  } else {
    // Backward compatible: allow custom sizes via w/h if needed (kept undocumented)
    const w = Number(url.searchParams.get('w') || 1080)
    const h = Number(url.searchParams.get('h') || 1080)
    png = renderUiPngBuffer({ w, h, year, filled, total, percent })
    filename = `year-dots-${year}-${w}x${h}.png`
  }

  send(res, 200, png, {
    'Content-Type': 'image/png',
    // n8n will download this; keep it fresh.
    'Cache-Control': 'no-store',
    'Content-Disposition': `inline; filename="${filename}"`,
    'X-Year': String(year),
    'X-Filled': String(filled),
    'X-Total': String(total),
    'X-Percent': String(percent),
  })
}

async function serveStatic(req, res) {
  const url = parseUrl(req)
  const pathname = decodeURIComponent(url.pathname)

  // Basic security: prevent .. traversal
  if (pathname.includes('..')) return notFound(res)

  const distDir = path.join(repoRoot, 'dist')
  const publicDir = path.join(repoRoot, 'public')

  // Prefer dist in prod, otherwise allow public as fallback
  const rootDir = isProd ? distDir : distDir

  // Try dist first
  const tryPaths = [
    path.join(rootDir, pathname),
    path.join(rootDir, pathname.endsWith('/') ? `${pathname}index.html` : `${pathname}/index.html`),
    // fallback to public for assets like favicon when running without build
    path.join(publicDir, pathname),
  ]

  for (const p of tryPaths) {
    try {
      const stat = await fs.stat(p)
      if (!stat.isFile()) continue
      const body = await fs.readFile(p)
      send(res, 200, body, { 'Content-Type': contentTypeFor(p) })
      return
    } catch {
      // continue
    }
  }

  // SPA fallback: serve dist/index.html when built
  try {
    const indexPath = path.join(distDir, 'index.html')
    const body = await fs.readFile(indexPath)
    send(res, 200, body, { 'Content-Type': 'text/html; charset=utf-8' })
    return
  } catch {
    // If not built, show hint
    send(
      res,
      200,
      `Server running.\n\n- GET /generate (default square 1080x1080)\n- GET /generate?format=story\n- GET /generate?format=square\n\nBuild the app for static serving: npm run build\n`,
      { 'Content-Type': 'text/plain; charset=utf-8' },
    )
  }
}

async function start() {
  if (!isProd) {
    // Dev mode: run Vite in middleware mode, but still handle /generate here.
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      root: repoRoot,
      // In middleware mode we don't need HMR; disabling it avoids opening an extra WS port.
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    })

    const server = http.createServer(async (req, res) => {
      try {
        const url = parseUrl(req)
        if (url.pathname === '/generate') return await handleGenerate(req, res)
        // Let Vite handle everything else in dev
        return vite.middlewares(req, res, () => notFound(res))
      } catch (e) {
        send(res, 500, `Error: ${e?.message || String(e)}`, { 'Content-Type': 'text/plain; charset=utf-8' })
      }
    })

    server.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Dev server: http://localhost:${port}`)
      console.log(`PNG endpoint: http://localhost:${port}/generate?format=square&tz=America/Santiago`)
    })

    return
  }

  // Prod mode: serve dist + /generate
  const server = http.createServer(async (req, res) => {
    try {
      const url = parseUrl(req)
      if (url.pathname === '/generate') return await handleGenerate(req, res)
      if (url.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' })
      return await serveStatic(req, res)
    } catch (e) {
      send(res, 500, `Error: ${e?.message || String(e)}`, { 'Content-Type': 'text/plain; charset=utf-8' })
    }
  })

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server: http://localhost:${port}`)
    console.log(`PNG endpoint: http://localhost:${port}/generate?format=square&tz=America/Santiago`)
  })
}

start()


