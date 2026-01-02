import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * This repo historically ran an "OG image generator" step at build time.
 * The implementation is intentionally lightweight here:
 * - If `public/og.png` exists, we do nothing.
 * - If it's missing, we warn but do not fail the build.
 *
 * If you want a dynamic OG image generator (e.g., to stamp the current year),
 * replace this script with a real implementation.
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const ogPath = path.join(repoRoot, 'public', 'og.png')

try {
  await fs.access(ogPath)
  // eslint-disable-next-line no-console
  console.log('[generate-og] ok: public/og.png already exists')
} catch {
  // eslint-disable-next-line no-console
  console.warn(
    '[generate-og] warning: public/og.png not found. Open Graph previews may be missing until you add it.',
  )
}

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const W = 1200
const H = 630

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInYear(year) {
  return isLeapYear(year) ? 366 : 365
}

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1)
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((current.getTime() - start.getTime()) / msPerDay) + 1
}

// Tiny 5x7 bitmap font for digits and a few symbols, scaled up.
// Each glyph is 7 rows of 5 bits (left to right).
const FONT_5x7 = {
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  '/': [0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b00000, 0b00000],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00110, 0b00110],
  '%': [0b11001, 0b11010, 0b00100, 0b01000, 0b10110, 0b00110, 0b00000],
  ' ': [0, 0, 0, 0, 0, 0, 0],
}

function u32be(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n >>> 0, 0)
  return b
}

function crc32(buf) {
  // Node has no built-in crc32, but PNG CRC is standard IEEE; implement table.
  // (Fast enough for our small chunks.)
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let k = 0; k < 8; k++) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type)
  const len = u32be(data.length)
  const crc = u32be(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function makeRGBA() {
  return Buffer.alloc(W * H * 4, 0)
}

function setPx(buf, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 4
  buf[i] = r
  buf[i + 1] = g
  buf[i + 2] = b
  buf[i + 3] = a
}

function fillRect(buf, x0, y0, x1, y1, r, g, b, a = 255) {
  x0 = Math.max(0, x0 | 0)
  y0 = Math.max(0, y0 | 0)
  x1 = Math.min(W, x1 | 0)
  y1 = Math.min(H, y1 | 0)
  for (let y = y0; y < y1; y++) {
    let i = (y * W + x0) * 4
    for (let x = x0; x < x1; x++) {
      buf[i] = r
      buf[i + 1] = g
      buf[i + 2] = b
      buf[i + 3] = a
      i += 4
    }
  }
}

function fillCircle(buf, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius
  const x0 = (cx - radius - 1) | 0
  const x1 = (cx + radius + 2) | 0
  const y0 = (cy - radius - 1) | 0
  const y1 = (cy + radius + 2) | 0
  for (let y = y0; y < y1; y++) {
    const dy = y - cy
    for (let x = x0; x < x1; x++) {
      const dx = x - cx
      if (dx * dx + dy * dy <= r2) setPx(buf, x, y, r, g, b, a)
    }
  }
}

function drawRing(buf, cx, cy, radius, thickness, r, g, b, a = 255) {
  const rOut = radius
  const rIn = Math.max(0, radius - thickness)
  const rOut2 = rOut * rOut
  const rIn2 = rIn * rIn
  const x0 = (cx - rOut - 1) | 0
  const x1 = (cx + rOut + 2) | 0
  const y0 = (cy - rOut - 1) | 0
  const y1 = (cy + rOut + 2) | 0
  for (let y = y0; y < y1; y++) {
    const dy = y - cy
    for (let x = x0; x < x1; x++) {
      const dx = x - cx
      const d2 = dx * dx + dy * dy
      if (d2 >= rIn2 && d2 <= rOut2) setPx(buf, x, y, r, g, b, a)
    }
  }
}

function drawText5x7(buf, text, x, y, scale, r, g, b, a = 255, spacing = 1) {
  let cursorX = x
  for (const ch of text) {
    const glyph = FONT_5x7[ch] ?? FONT_5x7[' ']
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row]
      for (let col = 0; col < 5; col++) {
        const on = (bits >> (4 - col)) & 1
        if (!on) continue
        const px = cursorX + col * scale
        const py = y + row * scale
        fillRect(buf, px, py, px + scale, py + scale, r, g, b, a)
      }
    }
    cursorX += (5 + spacing) * scale
  }
}

function writePng(outPath, rgbaBuf) {
  // Raw scanlines with filter type 0
  const stride = W * 4
  const raw = Buffer.alloc(H * (stride + 1))
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0
    rgbaBuf.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const compressed = zlib.deflateSync(raw, { level: 9 })

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const png = Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ])

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, png)
}

// --- Build the OG image ---
const today = new Date()
const year = today.getFullYear()
const total = daysInYear(year)
const filled = Math.min(dayOfYear(today), total)
const percent = ((filled / total) * 100).toFixed(1)

const rgba = makeRGBA()
fillRect(rgba, 0, 0, W, H, 0, 0, 0, 255)

// Header numbers (big and readable in Slack)
drawText5x7(rgba, `${filled}/${total}`, 80, 60, 10, 255, 255, 255, 255, 2)
drawText5x7(rgba, `${percent}%`, 80, 150, 10, 255, 255, 255, 220, 2)

// Dots grid representing all days (365/366)
const cols = 37
const rows = Math.ceil(total / cols)
const padX = 80
const padY = 250
const gridW = W - padX * 2
const gridH = H - padY - 70
const cellW = gridW / cols
const cellH = gridH / rows
const radius = Math.max(4, Math.floor(Math.min(cellW, cellH) * 0.22))
const ringT = Math.max(2, Math.floor(radius * 0.35))

for (let i = 0; i < total; i++) {
  const r = Math.floor(i / cols)
  const c = i % cols
  const cx = Math.round(padX + (c + 0.5) * cellW)
  const cy = Math.round(padY + (r + 0.5) * cellH)
  drawRing(rgba, cx, cy, radius, ringT, 255, 255, 255, 255)
  if (i < filled) fillCircle(rgba, cx, cy, radius - ringT - 1, 255, 255, 255, 255)
}

writePng('public/og.png', rgba)
console.log(`Generated public/og.png (${W}x${H}) for ${year}: ${filled}/${total} (${percent}%)`)


