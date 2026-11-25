// Draws "Rizba" (Ukrainian for "carving"), the launcher's display font: chunky condensed capitals
// that look cut from a linoleum block. Every letter is built from straight strokes (curves are
// cut as short facets), merged into one shape, then its outline gets a little seeded wobble so
// it looks hand-carved.
// Covers Latin and Cyrillic (Ukrainian + Russian) capitals, digits and common punctuation;
// lowercase letters map to the same capitals. Original artwork, no third-party glyphs.
//   node tools/make-font.mjs   ->  src/renderer/src/assets/fonts/Rizba.otf
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'
import polygonClipping from 'polygon-clipping'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(root, 'src/renderer/src/assets/fonts/Rizba.otf')

const H = 700 // cap height
const S = 128 // stem width
const BT = 110 // bar thickness
const TOP = H - BT / 2 // centre line of a top bar
const BOT = BT / 2 // centre line of a bottom bar
const SB = 34 // side bearing

// ---------- geometry ----------
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A straight cut of width t from a to b (butt ends). */
function quad(a, b, t) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * (t / 2), ny = (dx / len) * (t / 2)
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]
}

/** Fills the corner where two cuts meet. */
function joint(p, t) {
  const r = t / 2, pts = []
  for (let i = 0; i < 8; i++) pts.push([p[0] + Math.cos((i / 8) * Math.PI * 2 + Math.PI / 8) * r, p[1] + Math.sin((i / 8) * Math.PI * 2 + Math.PI / 8) * r])
  return pts
}

/** Glyph builder: collects polygons; `clip` keeps strokes inside [lo, hi] vertically. */
function glyph(w, draw, { lo = 0, hi = H } = {}) {
  const polys = []
  const g = {
    P(points, t = S, closed = false) {
      const n = points.length
      for (let i = 0; i < n - 1; i++) polys.push(quad(points[i], points[i + 1], t))
      if (closed) polys.push(quad(points[n - 1], points[0], t))
      const inner = closed ? points : points.slice(1, -1)
      for (const p of inner) polys.push(joint(p, t))
    },
    V(x, y0 = 0, y1 = H, t = S) { polys.push(quad([x, y0], [x, y1], t)) },
    B(x0, x1, y, t = BT) { polys.push(quad([x0, y], [x1, y], t)) },
    dot(x, y, size = 112) { polys.push(quad([x, y - size / 2], [x, y + size / 2], size * 0.95)) }
  }
  draw(g)
  return { w, polys, lo, hi }
}

const arc = (cx, cy, rx, ry, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => {
  const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
  return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]
})
const ring = (cx, cy, rx, ry, n = 12) => arc(cx, cy, rx, ry, 90, 90 + 360 - 360 / n, n - 1)
const mirrorPts = (w, pts) => pts.map(([x, y]) => [w - x, y])
const turnPts = (w, pts) => pts.map(([x, y]) => [w - x, H - y])

function clipBand(poly, lo, hi) {
  const cut = (pts, inside, cross) => {
    const out = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      const ia = inside(a), ib = inside(b)
      if (ia) out.push(a)
      if (ia !== ib) out.push(cross(a, b))
    }
    return out
  }
  const at = (y) => (a, b) => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y]
  let p = cut(poly, (q) => q[1] >= lo, at(lo))
  if (p.length) p = cut(p, (q) => q[1] <= hi, at(hi))
  return p
}

/** Hand-cut wobble: split long edges and nudge every point a little. */
function roughen(poly, r) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(1, Math.round(len / 80))
    const nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1)
    for (let k = 0; k < n; k++) {
      const t = k / n
      const j = k === 0 ? 4 : 7
      const off = (r() - 0.5) * 2 * j
      out.push([a[0] + (b[0] - a[0]) * t + nx * off + (k === 0 ? (r() - 0.5) * 6 : 0), a[1] + (b[1] - a[1]) * t + ny * off + (k === 0 ? (r() - 0.5) * 6 : 0)])
    }
  }
  return out
}

const area = (p) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1] }, 0) / 2

// ---------- letters ----------
const G = {}
const def = (chars, g) => { for (const c of chars) G[c] = g }

const bowlTop = [[230, 644], [340, 624], [385, 560], [385, 470], [330, 390], [230, 370]]
const bowlLow = [[230, 380], [360, 360], [420, 280], [420, 140], [360, 70], [230, 56]]
const pBowl = [[230, 644], [350, 620], [400, 540], [400, 450], [350, 370], [230, 345]]
const cArc = arc(235, 350, 171, 286, 40, 320, 9)

const A = glyph(520, (g) => { g.P([[60, -20], [260, 720], [460, -20]], 132); g.B(140, 380, 230, 100) })
const Bg = glyph(470, (g) => { g.V(64); g.B(0, 250, TOP); g.B(0, 250, 370, 104); g.B(0, 250, BOT); g.P(bowlTop, 120); g.P(bowlLow, 128) })
const C = glyph(450, (g) => g.P(cArc, 128))
const E = glyph(420, (g) => { g.V(64); g.B(0, 410, TOP); g.B(0, 370, 360, 104); g.B(0, 410, BOT) })
const Hh = glyph(480, (g) => { g.V(64); g.V(416); g.B(0, 480, 360, 104) })
const I = glyph(150, (g) => g.V(75))
const K = glyph(480, (g) => { g.V(64); g.P([[450, 720], [140, 330]], 130); g.P([[200, 400], [470, -20]], 138) })
const M = glyph(600, (g) => { g.V(64); g.V(536); g.P([[64, 680], [300, 250], [536, 680]], 122) })
const N = glyph(490, (g) => { g.V(64); g.V(426); g.P([[64, 700], [426, 0]], 138) })
const O = glyph(490, (g) => g.P(ring(245, 350, 181, 286), 128, true))
const Pp = glyph(460, (g) => { g.V(64); g.B(0, 260, TOP); g.B(0, 260, 345, 104); g.P(pBowl, 124) })
const R = glyph(470, (g) => { g.V(64); g.B(0, 260, TOP); g.B(0, 260, 345, 104); g.P(pBowl, 124); g.P([[220, 345], [450, -20]], 138) })
const T = glyph(460, (g) => { g.B(0, 460, TOP); g.V(230) })
const X = glyph(490, (g) => { g.P([[45, 720], [445, -20]], 138); g.P([[445, 720], [45, -20]], 138) })
const Y = glyph(480, (g) => { g.P([[40, 720], [240, 330]], 132); g.P([[440, 720], [240, 330]], 132); g.V(240, 0, 360) })

def('A', A); def('B', Bg); def('C', C); def('E', E); def('H', Hh); def('I', I); def('K', K); def('M', M); def('N', N); def('O', O); def('P', Pp); def('R', R); def('T', T); def('X', X); def('Y', Y)
def('D', glyph(480, (g) => { g.V(64); g.P([[0, 644], [250, 644], [370, 590], [416, 450], [416, 250], [370, 110], [250, 56], [0, 56]], 120) }))
def('F', glyph(410, (g) => { g.V(64); g.B(0, 400, TOP); g.B(0, 350, 350, 104) }))
def('G', glyph(480, (g) => { g.P(arc(235, 350, 171, 286, 40, 330, 9), 128); g.V(406, 60, 330); g.B(250, 470, 320, 104) }))
def('J', glyph(400, (g) => g.P([[336, 700], [336, 180], [290, 70], [200, 50], [110, 70], [64, 180], [64, 240]], 128)))
def('L', glyph(400, (g) => { g.V(64); g.B(0, 390, BOT) }))
def('Q', glyph(490, (g) => { g.P(ring(245, 350, 181, 286), 128, true); g.P([[290, 200], [470, -90]], 120) }, { lo: -100 }))
def('S', glyph(450, (g) => g.P([[420, 600], [320, 660], [150, 660], [70, 580], [70, 450], [150, 385], [300, 330], [380, 270], [385, 130], [300, 50], [130, 45], [30, 110]], 126)))
def('U', glyph(480, (g) => g.P([[64, 700], [64, 200], [110, 80], [240, 44], [370, 80], [416, 200], [416, 700]], 128)))
def('V', glyph(500, (g) => g.P([[45, 720], [250, -20], [455, 720]], 132)))
def('W', glyph(680, (g) => g.P([[45, 720], [180, -10], [340, 540], [500, -10], [635, 720]], 120)))
def('Z', glyph(440, (g) => { g.B(0, 430, TOP); g.B(10, 440, BOT); g.P([[400, 610], [40, 90]], 142) }))

// Digits
const six = [[360, 640], [260, 665], [150, 640], [80, 520], [64, 330], [80, 150], [170, 50], [300, 50], [390, 140], [390, 260], [310, 360], [180, 370], [90, 300]]
def('0', glyph(440, (g) => g.P(ring(220, 350, 156, 286), 124, true)))
def('1', glyph(300, (g) => { g.V(190); g.P([[190, 650], [50, 540]], 112) }))
def('2', glyph(440, (g) => { g.P([[50, 560], [120, 650], [260, 665], [360, 600], [380, 480], [330, 370], [70, 90]], 126); g.B(20, 420, BOT) }))
def('3', glyph(440, (g) => { g.P([[50, 600], [150, 660], [300, 660], [380, 580], [370, 450], [280, 380], [170, 370]], 120); g.P([[200, 370], [310, 350], [390, 260], [390, 140], [300, 50], [150, 45], [40, 110]], 126) }))
def('4', glyph(440, (g) => { g.P([[300, 700], [40, 240], [430, 240]], 120); g.V(310, 0, 520) }))
def('5', glyph(440, (g) => { g.B(70, 410, TOP); g.P([[110, 700], [90, 370]], 128); g.P([[90, 400], [260, 420], [370, 360], [400, 230], [360, 90], [240, 45], [120, 55], [40, 110]], 126) }))
def('6', glyph(450, (g) => g.P(six, 124)))
def('7', glyph(430, (g) => { g.B(0, 430, TOP); g.P([[410, 620], [170, -10]], 138) }))
def('8', glyph(440, (g) => { g.P(ring(220, 520, 130, 145, 10), 118, true); g.P(ring(220, 190, 165, 170, 10), 124, true) }))
def('9', glyph(450, (g) => g.P(turnPts(450, six), 124)))

// Cyrillic (letters shaped like Latin ones share their drawing)
Object.assign(G, { А: A, В: Bg, Е: E, К: K, М: M, Н: Hh, О: O, Р: Pp, С: C, Т: T, Х: X, І: I })
def('Б', glyph(460, (g) => { g.V(64); g.B(0, 420, TOP); g.B(0, 250, 380, 104); g.P(bowlLow, 128); g.B(0, 250, BOT) }))
def('Г', glyph(400, (g) => { g.V(64); g.B(0, 400, TOP) }))
def('Ґ', glyph(400, (g) => { g.V(64); g.B(0, 340, TOP); g.V(290, 600, 860, 100) }, { hi: 870 }))
def('Д', glyph(540, (g) => { g.B(120, 470, TOP); g.P([[190, 720], [110, 40]], 120); g.V(430, 0, 700); g.B(0, 540, BOT); g.V(45, -140, 60, 100); g.V(495, -140, 60, 100) }, { lo: -150 }))
def('Ж', glyph(720, (g) => { g.V(360); g.P([[50, 720], [330, 370]], 122); g.P([[330, 345], [45, -20]], 132); g.P([[670, 720], [390, 370]], 122); g.P([[390, 345], [675, -20]], 132) }))
def('З', G['3'])
def('И', glyph(490, (g) => { g.V(64); g.V(426); g.P([[64, 0], [426, 700]], 138) }))
def('Й', glyph(490, (g) => { g.V(64); g.V(426); g.P([[64, 0], [426, 700]], 138); g.P([[140, 880], [245, 790], [350, 880]], 84) }, { hi: 900 }))
def('Л', glyph(500, (g) => { g.V(436); g.B(150, 500, TOP); g.P([[190, 644], [175, 300], [140, 130], [80, 60], [10, 56]], 120) }))
def('П', glyph(480, (g) => { g.V(64); g.V(416); g.B(0, 480, TOP) }))
def('У', glyph(480, (g) => { g.P([[40, 720], [250, 290]], 128); g.P([[445, 720], [220, 180], [160, 80], [60, 50]], 124) }))
def('Ф', glyph(620, (g) => { g.V(310, -50, 760); g.P(ring(310, 360, 236, 205), 112, true) }, { lo: -60, hi: 770 }))
def('Ц', glyph(510, (g) => { g.V(64); g.V(410); g.B(0, 470, BOT); g.V(468, -140, 60, 104) }, { lo: -150 }))
def('Ч', glyph(460, (g) => { g.V(396); g.P([[64, 700], [64, 440], [110, 360], [230, 330], [396, 340]], 124) }))
def('Ш', glyph(680, (g) => { g.V(64); g.V(340); g.V(616); g.B(0, 680, BOT) }))
def('Щ', glyph(720, (g) => { g.V(64); g.V(330); g.V(596); g.B(0, 690, BOT); g.V(668, -140, 60, 104) }, { lo: -150 }))
const softSign = (dx) => (g) => { g.V(64 + dx); g.B(dx, 250 + dx, 380, 104); g.P(bowlLow.map(([x, y]) => [x + dx, y]), 128); g.B(dx, 250 + dx, BOT) }
def('Ь', glyph(450, softSign(0)))
def('Ъ', glyph(520, (g) => { softSign(70)(g); g.B(0, 190, TOP) }))
def('Ы', glyph(640, (g) => { softSign(0)(g); g.V(576) }))
def('Э', glyph(450, (g) => { g.P(mirrorPts(470, cArc), 128); g.B(150, 410, 355, 100) }))
def('Є', glyph(450, (g) => { g.P(cArc, 128); g.B(40, 300, 355, 100) }))
def('Ю', glyph(680, (g) => { g.V(64); g.B(0, 300, 355, 104); g.P(ring(450, 350, 166, 286), 124, true) }))
def('Я', glyph(470, (g) => { g.V(406); g.B(210, 470, TOP); g.B(210, 470, 345, 104); g.P(mirrorPts(470, pBowl), 124); g.P([[250, 345], [20, -20]], 138) }))
def('Ё', glyph(420, (g) => { g.V(64); g.B(0, 410, TOP); g.B(0, 370, 360, 104); g.B(0, 410, BOT); g.dot(130, 840, 92); g.dot(300, 840, 92) }, { hi: 900 }))
def('Ї', glyph(280, (g) => { g.V(140); g.dot(50, 840, 90); g.dot(230, 840, 90) }, { hi: 900 }))

// Punctuation
def('.', glyph(140, (g) => g.dot(70, 62)))
def(',', glyph(150, (g) => g.P([[85, 122], [85, 20], [40, -110]], 108), { lo: -130 }))
def(':', glyph(140, (g) => { g.dot(70, 62); g.dot(70, 420) }))
def(';', glyph(150, (g) => { g.P([[85, 122], [85, 20], [40, -110]], 108); g.dot(80, 420) }, { lo: -130 }))
def('!', glyph(150, (g) => { g.V(75, 240, 700, 122); g.dot(75, 62) }))
def('?', glyph(400, (g) => { g.P([[40, 560], [120, 650], [260, 665], [350, 600], [360, 480], [290, 400], [200, 350], [200, 230]], 120); g.dot(200, 62) }))
def('-', glyph(300, (g) => g.B(30, 270, 300, 100)))
def('‐‑', G['-'])
def('–', glyph(420, (g) => g.B(20, 400, 300, 100)))
def('—', glyph(700, (g) => g.B(20, 680, 300, 100)))
def('_', glyph(420, (g) => g.B(0, 420, -60, 80), { lo: -120 }))
def("'’‘", glyph(140, (g) => g.P([[75, 720], [62, 480]], 104), { hi: 730 }))
def('"“”', glyph(260, (g) => { g.P([[75, 720], [62, 480]], 104); g.P([[190, 720], [177, 480]], 104) }, { hi: 730 }))
def('(', glyph(220, (g) => g.P([[190, 760], [80, 570], [60, 350], [80, 130], [190, -60]], 100), { lo: -70, hi: 770 }))
def(')', glyph(220, (g) => g.P(mirrorPts(220, [[190, 760], [80, 570], [60, 350], [80, 130], [190, -60]]), 100), { lo: -70, hi: 770 }))
def('/', glyph(320, (g) => g.P([[295, 740], [25, -40]], 110), { lo: -50, hi: 750 }))
def('…', glyph(440, (g) => { g.dot(70, 62); g.dot(220, 62); g.dot(370, 62) }))
def('·', glyph(140, (g) => g.dot(70, 330, 100)))
def('<', glyph(380, (g) => g.P([[340, 620], [50, 350], [340, 80]], 112)))
def('>', glyph(380, (g) => g.P(mirrorPts(380, [[340, 620], [50, 350], [340, 80]]), 112)))
def('+', glyph(380, (g) => { g.B(30, 350, 330, 100); g.V(190, 170, 490, 100) }))
def('=', glyph(380, (g) => { g.B(30, 350, 430, 90); g.B(30, 350, 230, 90) }))
def('%', glyph(560, (g) => { g.P(ring(120, 540, 80, 110, 8), 80, true); g.P(ring(440, 160, 80, 110, 8), 80, true); g.P([[470, 720], [90, -20]], 100) }))

// ---------- assemble ----------
function toPath(c, g) {
  const r = rng([...c].reduce((h, ch) => Math.imul(h ^ ch.codePointAt(0), 16777619), 2166136261))
  const p = new opentype.Path()
  // Merge all strokes into one shape first, so pieces never leave seams between them.
  const parts = g.polys.map((poly) => clipBand(poly, g.lo, g.hi)).filter((poly) => poly.length >= 3).map((poly) => [poly.map(([x, y]) => [Math.round(x), Math.round(y)])]) // whole units keep the union stable
  if (!parts.length) return p
  for (const shape of polygonClipping.union(...parts)) {
    shape.forEach((ring0, i) => {
      // polygon-clipping repeats the first point at the end; outlines go anticlockwise, holes clockwise.
      const ring = roughen(ring0.slice(0, -1), r)
      if (area(ring) < 0 !== i > 0) ring.reverse()
      ring.forEach(([x, y], k) => (k ? p.lineTo(Math.round(x + SB), Math.round(y)) : p.moveTo(Math.round(x + SB), Math.round(y))))
      p.close()
    })
  }
  return p
}

const glyphs = [new opentype.Glyph({ name: '.notdef', advanceWidth: 500, path: new opentype.Path() }), new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 220, path: new opentype.Path() })]
glyphs.push(new opentype.Glyph({ name: 'nbspace', unicode: 0xa0, advanceWidth: 220, path: new opentype.Path() }))
let n = 0
for (const [c, g] of Object.entries(G)) {
  if (!g) continue
  const cp = c.codePointAt(0)
  const lower = c.toLowerCase()
  const outline = toPath(c, g)
  glyphs.push(new opentype.Glyph({ name: `g${cp.toString(16)}`, unicode: cp, advanceWidth: g.w + SB * 2, path: outline }))
  // Lowercase gets its own entry with the same drawing (one code point per glyph in the cmap).
  if (lower !== c && lower.length === 1) {
    glyphs.push(new opentype.Glyph({ name: `g${lower.codePointAt(0).toString(16)}`, unicode: lower.codePointAt(0), advanceWidth: g.w + SB * 2, path: outline }))
  }
  n++
}

const font = new opentype.Font({ familyName: 'Rizba', styleName: 'Regular', unitsPerEm: 1000, ascender: 900, descender: -250, designer: 'Vasya Family', glyphs })
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, Buffer.from(font.toArrayBuffer()))
console.log(`Rizba: ${n} glyphs -> ${path.relative(root, OUT)} (${fs.statSync(OUT).size} bytes)`)
