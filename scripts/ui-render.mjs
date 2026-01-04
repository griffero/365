import { Resvg } from '@resvg/resvg-js'
import jpeg from 'jpeg-js'

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderUiPngBuffer({
  w,
  h,
  year,
  filled,
  total,
  percent,
  title = 'year progress',
  footer = `${year}`,
}) {
  const svg = renderUiSvg({ w, h, year, filled, total, percent, title, footer })
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    background: 'black',
  })
  return resvg.render().asPng()
}

export function renderUiJpegBuffer(
  {
    w,
    h,
    year,
    filled,
    total,
    percent,
    title = 'year progress',
    footer = `${year}`,
  },
  { quality = 90 } = {},
) {
  const svg = renderUiSvg({ w, h, year, filled, total, percent, title, footer })
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'original' },
    background: 'black',
  })
  const img = resvg.render()
  // jpeg-js expects RGBA buffer.
  const encoded = jpeg.encode({ data: img.pixels, width: img.width, height: img.height }, quality)
  return encoded.data
}

export function renderPostSquarePngBuffer({ year, filled, total, percent }) {
  return renderUiPngBuffer({ w: 1080, h: 1080, year, filled, total, percent })
}

export function renderStoryPngBuffer({ year, filled, total, percent }) {
  return renderUiPngBuffer({ w: 1080, h: 1920, year, filled, total, percent })
}

export function renderPostSquareJpegBuffer({ year, filled, total, percent }, { quality } = {}) {
  return renderUiJpegBuffer({ w: 1080, h: 1080, year, filled, total, percent }, { quality })
}

export function renderStoryJpegBuffer({ year, filled, total, percent }, { quality } = {}) {
  return renderUiJpegBuffer({ w: 1080, h: 1920, year, filled, total, percent }, { quality })
}

function renderUiSvg({ w, h, year, filled, total, percent, title, footer }) {
  // Match the front-end layout: header (title left, stats right), grid of 19 columns, footer.
  const safe = h >= 1600 ? { top: 260, bottom: 320, left: 90, right: 90 } : { top: 90, bottom: 90, left: 90, right: 90 }

  const contentX = safe.left
  const contentY = safe.top
  const contentW = w - safe.left - safe.right
  const contentH = h - safe.top - safe.bottom

  const fontStack =
    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"'

  // Scale typography between story and square
  const isStory = h > w
  const titleSize = isStory ? 50 : 44
  const statSize = isStory ? 38 : 32
  const statSubSize = isStory ? 30 : 26
  const footerSize = isStory ? 28 : 24

  // Square posts look better if the grid block sits a bit higher (more visually centered),
  // so we keep the header readable but reduce the reserved header height + gap.
  const headerH = isStory ? 180 : 120
  const footerH = isStory ? 96 : 80
  const sectionGap = isStory ? 56 : 28

  const statsXRight = contentX + contentW

  // Grid rect
  const gridTop = contentY + headerH + sectionGap
  const gridBottom = contentY + contentH - footerH
  const gridH = Math.max(0, gridBottom - gridTop)
  const gridW = contentW

  const cols = 19
  const rows = Math.ceil(total / cols)

  // Solve dot size + gap based on available rect (same math as exportStoryPng.ts)
  const gapRatio = 0.32
  const dotByW = gridW / (cols + (cols - 1) * gapRatio)
  const dotByH = gridH / (rows + (rows - 1) * gapRatio)
  const dot = Math.floor(Math.min(dotByW, dotByH))
  const gap = Math.floor(dot * gapRatio)

  const dotClamped = clamp(dot, 12, 64)
  const gapClamped = clamp(gap, 3, 28)

  const gridDrawW = cols * dotClamped + (cols - 1) * gapClamped
  const gridDrawH = rows * dotClamped + (rows - 1) * gapClamped

  const startX = contentX + (gridW - gridDrawW) / 2
  const startY = gridTop + (gridH - gridDrawH) / 2

  const r = dotClamped / 2
  const strokeW = clamp(Math.round(dotClamped * 0.12), 2, 6)

  const circles = []
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    const x = startX + col * (dotClamped + gapClamped)
    const y = startY + row * (dotClamped + gapClamped)
    const cx = round2(x + r)
    const cy = round2(y + r)
    const fill = i < filled ? '#fff' : 'transparent'
    circles.push(
      `<circle cx="${cx}" cy="${cy}" r="${round2(r)}" fill="${fill}" stroke="#fff" stroke-width="${strokeW}" />`,
    )
  }

  // Use <text> for typography; resvg will use available fonts on the server.
  // Keep it crisp with dominant-baseline and explicit opacities.
  const footerY = isStory
    ? contentY + contentH - footerH + 32
    : // For square posts, place the year so top/bottom padding feel symmetric.
      h - safe.bottom - footerSize

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="0" y="0" width="${w}" height="${h}" fill="#000" />

  <!-- Header -->
  <text x="${contentX}" y="${contentY}" fill="#fff" font-family="${esc(fontStack)}" font-size="${titleSize}" font-weight="600" dominant-baseline="hanging">
    ${esc(title)}
  </text>

  <g font-family="${esc(fontStack)}" text-anchor="end">
    <text x="${statsXRight}" y="${contentY + 8}" fill="rgba(255,255,255,0.82)" font-size="${statSize}" font-weight="500" dominant-baseline="hanging">
      ${esc(`${filled} / ${total}`)}
    </text>
    <text x="${statsXRight}" y="${contentY + 8 + 46}" fill="rgba(255,255,255,0.72)" font-size="${statSubSize}" font-weight="500" dominant-baseline="hanging">
      ${esc(`${percent}%`)}
    </text>
  </g>

  <!-- Grid -->
  <g>
    ${circles.join('\n    ')}
  </g>

  <!-- Footer -->
  <text x="${contentX}" y="${footerY}" fill="rgba(255,255,255,0.6)" font-family="${esc(fontStack)}" font-size="${footerSize}" font-weight="500" dominant-baseline="hanging">
    ${esc(footer)}
  </text>
</svg>`
}


