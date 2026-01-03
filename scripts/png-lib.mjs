import zlib from 'node:zlib'

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
  // PNG CRC (IEEE). Fast enough for our chunks.
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

function makeRGBA(w, h) {
  return Buffer.alloc(w * h * 4, 0)
}

function setPx(buf, w, h, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w || y >= h) return
  const i = (y * w + x) * 4
  buf[i] = r
  buf[i + 1] = g
  buf[i + 2] = b
  buf[i + 3] = a
}

function fillRect(buf, w, h, x0, y0, x1, y1, r, g, b, a = 255) {
  x0 = Math.max(0, x0 | 0)
  y0 = Math.max(0, y0 | 0)
  x1 = Math.min(w, x1 | 0)
  y1 = Math.min(h, y1 | 0)
  for (let y = y0; y < y1; y++) {
    let i = (y * w + x0) * 4
    for (let x = x0; x < x1; x++) {
      buf[i] = r
      buf[i + 1] = g
      buf[i + 2] = b
      buf[i + 3] = a
      i += 4
    }
  }
}

function fillCircle(buf, w, h, cx, cy, radius, r, g, b, a = 255) {
  const r2 = radius * radius
  const x0 = (cx - radius - 1) | 0
  const x1 = (cx + radius + 2) | 0
  const y0 = (cy - radius - 1) | 0
  const y1 = (cy + radius + 2) | 0
  for (let y = y0; y < y1; y++) {
    const dy = y - cy
    for (let x = x0; x < x1; x++) {
      const dx = x - cx
      if (dx * dx + dy * dy <= r2) setPx(buf, w, h, x, y, r, g, b, a)
    }
  }
}

function drawRing(buf, w, h, cx, cy, radius, thickness, r, g, b, a = 255) {
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
      if (d2 >= rIn2 && d2 <= rOut2) setPx(buf, w, h, x, y, r, g, b, a)
    }
  }
}

function drawText5x7(buf, w, h, text, x, y, scale, r, g, b, a = 255, spacing = 1) {
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
        fillRect(buf, w, h, px, py, px + scale, py + scale, r, g, b, a)
      }
    }
    cursorX += (5 + spacing) * scale
  }
}

function measureText(text, scale, spacing = 1) {
  return text.length * (5 + spacing) * scale - spacing * scale
}

export function computeYearProgress({ now = new Date(), timeZone } = {}) {
  const parts = timeZone ? zonedYMD(now, timeZone) : localYMD(now)
  const year = parts.year
  const total = isLeapYear(year) ? 366 : 365
  const filled = Math.min(dayOfYearFromYMD(parts), total)
  const percent = ((filled / total) * 100).toFixed(1)
  return { year, total, filled, percent }
}

function localYMD(d) {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

function zonedYMD(d, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = dtf.formatToParts(d)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  if (!year || !month || !day) throw new Error(`Invalid timeZone '${timeZone}'`)
  return { year, month, day }
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function dayOfYearFromYMD({ year, month, day }) {
  // Compute based on the calendar date in the chosen zone (Y-M-D),
  // by using UTC midnight for both start and current to avoid DST.
  const start = Date.UTC(year, 0, 1)
  const current = Date.UTC(year, month - 1, day)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((current - start) / msPerDay) + 1
}

export function encodePng({ w, h, rgbaBuf }) {
  // Raw scanlines with filter type 0
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    rgbaBuf.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const compressed = zlib.deflateSync(raw, { level: 9 })

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

export function renderOgPngBuffer({ w, h, filled, total, percent }) {
  const rgba = makeRGBA(w, h)
  fillRect(rgba, w, h, 0, 0, w, h, 0, 0, 0, 255)

  const headerScale = Math.max(8, Math.floor(Math.min(w, h) / 120))
  const subScale = Math.max(8, Math.floor(headerScale * 0.9))

  const headerText = `${filled}/${total}`
  const subText = `${percent}%`

  // Keep numbers in a safe centered area to survive crops
  const safePad = Math.round(Math.min(w, h) * 0.08)
  const headerY = safePad
  const headerW = measureText(headerText, headerScale, 2)
  const subW = measureText(subText, subScale, 2)
  const headerX = Math.round((w - headerW) / 2)
  const subX = Math.round((w - subW) / 2)

  drawText5x7(rgba, w, h, headerText, headerX, headerY, headerScale, 255, 255, 255, 255, 2)
  drawText5x7(rgba, w, h, subText, subX, headerY + headerScale * 10, subScale, 255, 255, 255, 220, 2)

  // Dots grid under header, centered and padded
  const gridTop = headerY + headerScale * 20
  const gridBottomPad = safePad
  const gridH = Math.max(10, h - gridTop - gridBottomPad)
  const gridW = w - safePad * 2

  // Choose columns to balance aspect ratio
  const cols = w >= h ? 37 : 28
  const rows = Math.ceil(total / cols)
  const cellW = gridW / cols
  const cellH = gridH / rows
  const radius = Math.max(4, Math.floor(Math.min(cellW, cellH) * 0.22))
  const ringT = Math.max(2, Math.floor(radius * 0.35))

  for (let i = 0; i < total; i++) {
    const rr = Math.floor(i / cols)
    const cc = i % cols
    const cx = Math.round(safePad + (cc + 0.5) * cellW)
    const cy = Math.round(gridTop + (rr + 0.5) * cellH)
    drawRing(rgba, w, h, cx, cy, radius, ringT, 255, 255, 255, 255)
    if (i < filled) fillCircle(rgba, w, h, cx, cy, radius - ringT - 1, 255, 255, 255, 255)
  }

  return encodePng({ w, h, rgbaBuf: rgba })
}

export function renderStoryPngBuffer({ w = 1080, h = 1920, filled, total, percent }) {
  const rgba = makeRGBA(w, h)
  fillRect(rgba, w, h, 0, 0, w, h, 0, 0, 0, 255)

  // Match the frontend's generous story safe-area, in pixels.
  const safe = { top: 260, bottom: 320, left: 90, right: 90 }
  const contentX = safe.left
  const contentY = safe.top
  const contentW = w - safe.left - safe.right
  const contentH = h - safe.top - safe.bottom

  // Header: big numbers centered in content
  const headerText = `${filled}/${total}`
  const subText = `${percent}%`
  const headerScale = Math.max(12, Math.floor(Math.min(contentW, contentH) / 36))
  const subScale = Math.max(10, Math.floor(headerScale * 0.7))

  const headerW = measureText(headerText, headerScale, 2)
  const subW = measureText(subText, subScale, 2)
  const headerX = Math.round(contentX + (contentW - headerW) / 2)
  const headerY = contentY
  const subX = Math.round(contentX + (contentW - subW) / 2)
  const subY = headerY + headerScale * 10 + Math.round(headerScale * 1.2)

  drawText5x7(rgba, w, h, headerText, headerX, headerY, headerScale, 255, 255, 255, 255, 2)
  drawText5x7(rgba, w, h, subText, subX, subY, subScale, 255, 255, 255, 220, 2)

  // Grid under header
  const gridTop = subY + subScale * 10 + 70
  const gridBottom = contentY + contentH
  const gridH = Math.max(10, gridBottom - gridTop)
  const gridW = contentW

  const cols = 19
  const rows = Math.ceil(total / cols)
  const cellW = gridW / cols
  const cellH = gridH / rows
  const radius = Math.max(6, Math.floor(Math.min(cellW, cellH) * 0.22))
  const ringT = Math.max(2, Math.floor(radius * 0.35))

  for (let i = 0; i < total; i++) {
    const rr = Math.floor(i / cols)
    const cc = i % cols
    const cx = Math.round(contentX + (cc + 0.5) * cellW)
    const cy = Math.round(gridTop + (rr + 0.5) * cellH)
    drawRing(rgba, w, h, cx, cy, radius, ringT, 255, 255, 255, 255)
    if (i < filled) fillCircle(rgba, w, h, cx, cy, radius - ringT - 1, 255, 255, 255, 255)
  }

  return encodePng({ w, h, rgbaBuf: rgba })
}


