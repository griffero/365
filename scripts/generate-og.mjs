import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeYearProgress, renderOgPngBuffer } from './png-lib.mjs'

// --- Build the OG images ---
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const outWidePath = path.join(repoRoot, 'public', 'og.png')
const outSquarePath = path.join(repoRoot, 'public', 'og-square.png')

const { year, total, filled, percent } = computeYearProgress()

await fs.mkdir(path.dirname(outWidePath), { recursive: true })
await fs.writeFile(outWidePath, renderOgPngBuffer({ w: 1200, h: 630, filled, total, percent }))
await fs.writeFile(outSquarePath, renderOgPngBuffer({ w: 1080, h: 1080, filled, total, percent }))
console.log(
  `Generated OG images for ${year}: ${filled}/${total} (${percent}%) -> ${path.relative(repoRoot, outWidePath)} and ${path.relative(repoRoot, outSquarePath)}`,
)


