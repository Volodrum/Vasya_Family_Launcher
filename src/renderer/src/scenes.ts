/**
 * The launcher's background: a carved crystal cave (linocut style), drawn as SVG at 1100x680
 * (the window's default size). Shapes only use the classes below, so the theme's colours
 * (CSS variables) recolour it:
 *   i / a / p     fill with ink / accent / paper
 *   si / sp       stroke with ink / paper
 *   nf            no fill
 * The #vf-rough and #vf-grain filters live in <ArtDefs> (art.tsx).
 */

const NS = 'http://www.w3.org/2000/svg'
const W = 1100
const H = 680
type Pt = [number, number]

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const e = document.createElementNS(NS, tag)
  for (const k in attrs) e.setAttribute(k, String(attrs[k]))
  parent.appendChild(e)
  return e
}

const pts = (l: Pt[]): string => l.map((p) => p.join(',')).join(' ')
const ground = (g: Element): void => void el('rect', { class: 'i', x: 0, y: 646, width: W, height: 40 }, g)

function cave(g: Element): void {
  const r = rng(85)
  const wall: Pt[] = [[0, 46], [130, 46], [96, 120], [150, 190], [110, 270], [170, 350], [130, 430], [200, 500], [180, 570], [250, 640], [0, 690]]
  for (const t of ['', 'translate(1100 0) scale(-1 1)']) {
    const w = el('g', { transform: t }, g)
    el('polygon', { class: 'i', points: pts([...wall, [0, 690]]) }, w)
    for (let k = 0; k < 26; k++) el('path', { class: 'nf sp', 'stroke-width': 2.2, d: `M${14 + r() * 70} ${70 + r() * 560} l ${8 + r() * 14} ${-4 + r() * 8}` }, w)
  }
  let x = 140
  while (x < 960) {
    const w = 18 + r() * 30
    const h = 20 + r() * 70
    el('polygon', { class: 'i', points: pts([[x, 44], [x + w, 44], [x + w / 2 + (r() - 0.5) * 8, 44 + h]]) }, g)
    x += w + r() * 26
  }
  el('rect', { class: 'i', x: 0, y: 0, width: W, height: 54 }, g)
  el('path', { class: 'i', d: 'M0 690 L0 610 C 200 590 320 600 420 596 C 520 592 640 604 760 596 C 880 590 980 600 1100 610 L1100 690 Z' }, g)
  for (let k = 0; k < 30; k++) el('path', { class: 'nf sp', 'stroke-width': 2, d: `M${r() * W} ${616 + r() * 26} l ${10 + r() * 12} ${-2 + r() * 4}` }, g)
  const crystal = (cx: number, b: number, h: number, w: number, rot: number): void => {
    const c = el('g', { transform: `rotate(${rot} ${cx} ${b})` }, g)
    el('polygon', { class: 'a si', points: pts([[cx - w, b], [cx - w, b - h * 0.72], [cx, b - h], [cx + w, b - h * 0.72], [cx + w, b]]), 'stroke-width': 3 }, c)
    el('path', { class: 'nf sp', 'stroke-width': 2.4, d: `M${cx} ${b - h + 6} L${cx} ${b - 4} M${cx - w + 3} ${b - h * 0.7} L${cx} ${b - h * 0.6} L${cx + w - 3} ${b - h * 0.7}` }, c)
  }
  const clusters: [number, number, [number, number, number, number][]][] = [
    [250, 616, [[0, 150, 26, -14], [40, 110, 20, 18], [-40, 90, 18, -34], [70, 70, 14, 34]]],
    [860, 614, [[0, 170, 28, 10], [-42, 120, 20, -20], [44, 90, 18, 30], [-80, 70, 14, -40]]],
    [400, 604, [[0, 50, 11, -10], [20, 36, 9, 24]]],
    [700, 602, [[0, 56, 12, 8], [-20, 38, 9, -26]]]
  ]
  for (const [cx, b, items] of clusters) for (const [dx, h, w, rot] of items) crystal(cx + dx, b, h, w, rot)
  // Hanging lantern.
  el('line', { class: 'si', x1: 300, y1: 54, x2: 300, y2: 112, 'stroke-width': 3 }, g)
  el('path', { class: 'i', d: 'M284 112 L316 112 L312 120 L288 120 Z M286 150 L314 150 L318 158 L282 158 Z' }, g)
  el('rect', { class: 'a si', x: 288, y: 120, width: 24, height: 30, 'stroke-width': 3 }, g)
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    el('line', { class: 'si', x1: 300 + Math.cos(a) * 32, y1: 136 + Math.sin(a) * 32, x2: 300 + Math.cos(a) * 46, y2: 136 + Math.sin(a) * 46, 'stroke-width': 2.4 }, g)
  }
  ground(g)
}

export function drawScene(svg: SVGSVGElement): void {
  svg.replaceChildren()
  const g = el('g', { filter: 'url(#vf-rough)' }, svg)
  cave(g)
  el('rect', { width: W, height: H, filter: 'url(#vf-grain)' }, svg)
}
