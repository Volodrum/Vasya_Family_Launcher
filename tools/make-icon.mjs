// Draws the launcher logo ("double-rim V": amethyst V, dark gap, gold outer rim) as 16x16 pixel art
// and writes build/icon.png (512), build/icon.ico (16-256) and src/renderer/src/assets/logo.png (16).
// node tools/make-icon.mjs
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const C = {
  K: [0x12, 0x08, 0x18], // night (background)
  L: [0xdc, 0xaa, 0xff], // amethyst highlight
  A: [0xb8, 0x4d, 0xff], // amethyst
  P: [0x7a, 0x2f, 0xc0], // amethyst shadow
  Y: [0xf2, 0xc1, 0x4e], // gold
  y: [0xb8, 0x86, 0x2a] // gold shadow
}
const V = [
  'XXX......XXX',
  'XXX......XXX',
  '.XXX....XXX.',
  '.XXX....XXX.',
  '..XXX..XXX..',
  '..XXX..XXX..',
  '...XXXXXX...',
  '...XXXXXX...',
  '....XXXX....',
  '....XXXX....',
  '.....XX.....'
]

const N = 16
const grid = Array.from({ length: N }, () => Array(N).fill('K'))
const key = (x, y) => `${x},${y}`
const set = (l) => new Set(l.map(([x, y]) => key(x, y)))
const dilate = (l) => {
  const m = new Map()
  for (const [x, y] of l) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) m.set(key(x + i, y + j), [x + i, y + j])
  return [...m.values()]
}
const paint = (l, c) => l.forEach(([x, y]) => { if (x >= 0 && x < N && y >= 0 && y < N) grid[y][x] = c })

const v = V.flatMap((r, j) => [...r].flatMap((ch, i) => (ch === 'X' ? [[2 + i, 2 + j]] : [])))
const gap = dilate(v)
const gapSet = set(gap)
const rim = dilate(gap).filter(([x, y]) => !gapSet.has(key(x, y)))
paint(rim, 'Y')
paint(rim.filter(([, y]) => y === 14), 'y')
const vs = set(v)
const has = (x, y) => vs.has(key(x, y))
for (const [x, y] of v) grid[y][x] = !has(x - 1, y) || !has(x, y - 1) ? 'L' : !has(x + 1, y) || !has(x, y + 1) ? 'P' : 'A'

// Transparent outside the rim's footprint so the icon isn't a dark square on light taskbars.
const inside = set(dilate(gap))
function rgba(size) {
  const s = size / N
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = Math.floor(x / s), gy = Math.floor(y / s)
    const o = (y * size + x) * 4
    if (!inside.has(key(gx, gy))) continue
    buf.set([...C[grid[gy][gx]], 255], o)
  }
  return buf
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}
function png(size) {
  const px = rgba(size)
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
function ico(sizes) {
  const imgs = sizes.map(png)
  const head = Buffer.alloc(6 + 16 * sizes.length)
  head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4)
  let off = head.length
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(off, e + 12)
    off += imgs[i].length
  })
  return Buffer.concat([head, ...imgs])
}

const out = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); console.log(rel, data.length, 'bytes') }
out('build/icon.png', png(512))
out('build/icon.ico', ico([16, 20, 24, 32, 40, 48, 64, 96, 128, 256])) // in-between sizes so Windows doesn't blur-scale at 125/150% DPI
out('src/renderer/src/assets/logo.png', png(16))
if (process.argv.includes('--preview')) out('build/icon-preview-64.png', png(64))
