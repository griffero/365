type ExportStoryPngInput = {
  totalDays: number
  filledCount: number
  year: number
  yearPercent: string
  title?: string
}

type SafeArea = {
  top: number
  bottom: number
  left: number
  right: number
}

const DEFAULT_SAFE_AREA: SafeArea = {
  // Generous safe padding for Instagram Stories UI (top bar + bottom controls).
  top: 260,
  bottom: 320,
  left: 90,
  right: 90,
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function safeFilename(base: string) {
  return base.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function shareBlobAsFile(blob: Blob, filename: string) {
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>
  }

  if (!nav.share) return false

  const file = new File([blob], filename, { type: blob.type || 'image/png' })
  if (nav.canShare && !nav.canShare({ files: [file] })) return false

  await nav.share({ files: [file], title: filename })
  return true
}

export async function exportStoryPng(input: ExportStoryPngInput) {
  const width = 1080
  const height = 1920

  const title = input.title ?? 'Year progress'
  const safe = DEFAULT_SAFE_AREA

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create 2D canvas context')

  // Background
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  const contentX = safe.left
  const contentY = safe.top
  const contentW = width - safe.left - safe.right
  const contentH = height - safe.top - safe.bottom

  // Typography
  const fontStack =
    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"'

  // Header / footer layout
  const headerH = 180
  const footerH = 96
  const sectionGap = 56

  // Title (left)
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(255,255,255,1)'
  ctx.font = `600 50px ${fontStack}`
  ctx.fillText(title, contentX, contentY)

  // Stats (right)
  const statsXRight = contentX + contentW
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  ctx.font = `500 38px ${fontStack}`
  ctx.fillText(`${input.filledCount} / ${input.totalDays}`, statsXRight, contentY + 8)
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = `500 30px ${fontStack}`
  ctx.fillText(`${input.yearPercent}%`, statsXRight, contentY + 8 + 46)

  // Grid rect
  const gridTop = contentY + headerH + sectionGap
  const gridBottom = contentY + contentH - footerH
  const gridH = Math.max(0, gridBottom - gridTop)
  const gridW = contentW

  const cols = 19
  const rows = Math.ceil(input.totalDays / cols)

  // Solve dot size + gap based on available rect.
  const gapRatio = 0.32
  const dotByW = gridW / (cols + (cols - 1) * gapRatio)
  const dotByH = gridH / (rows + (rows - 1) * gapRatio)
  const dot = Math.floor(Math.min(dotByW, dotByH))
  const gap = Math.floor(dot * gapRatio)

  // Guard rails (in case viewport is tiny due to weird safe area values)
  const dotClamped = clamp(dot, 12, 64)
  const gapClamped = clamp(gap, 3, 28)

  const gridDrawW = cols * dotClamped + (cols - 1) * gapClamped
  const gridDrawH = rows * dotClamped + (rows - 1) * gapClamped

  const startX = contentX + (gridW - gridDrawW) / 2
  const startY = gridTop + (gridH - gridDrawH) / 2

  // Dots
  const r = dotClamped / 2
  const lineW = clamp(Math.round(dotClamped * 0.12), 2, 6)
  ctx.lineWidth = lineW
  ctx.strokeStyle = 'rgba(255,255,255,1)'

  for (let i = 0; i < input.totalDays; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols

    const x = startX + col * (dotClamped + gapClamped)
    const y = startY + row * (dotClamped + gapClamped)

    const cx = round2(x + r)
    const cy = round2(y + r)

    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    if (i < input.filledCount) {
      ctx.fillStyle = 'rgba(255,255,255,1)'
      ctx.fill()
    }
    ctx.stroke()
  }

  // Footer
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = `500 28px ${fontStack}`
  const footerText = `${input.year} • Local time`
  ctx.fillText(footerText, contentX, contentY + contentH - footerH + 32)

  // Export
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to export PNG'))), 'image/png')
  })

  const filename = safeFilename(`year-progress-${input.year}-${width}x${height}.png`)

  // iOS Safari downloads go to Files. Prefer Share Sheet (allows "Save Image") when available.
  try {
    const shared = await shareBlobAsFile(blob, filename)
    if (shared) return
  } catch {
    // If user cancels share or it fails, fall back to download.
  }

  downloadBlob(blob, filename)
}


