/**
 * Pixel-art textures drawn at runtime (16x16, upscaled with image-rendering: pixelated).
 * They are original, generated from seeded noise, so the launcher ships no game assets.
 */

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

function hex(c: [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function shade(c: [number, number, number], k: number): [number, number, number] {
  return [c[0], c[1], c[2]].map((v) => Math.max(0, Math.min(255, Math.round(v * k)))) as [number, number, number]
}

function canvas(size = 16): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return [c, c.getContext('2d')!]
}

/** Speckled block: base colour with random lighter/darker pixels. */
function speckle(seed: number, base: [number, number, number], spread: number, specks: [number, number, number][] = []): string {
  const [c, g] = canvas()
  const r = rng(seed)
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let col = shade(base, 1 + (r() - 0.5) * spread)
      if (specks.length && r() < 0.12) col = specks[Math.floor(r() * specks.length)]
      g.fillStyle = hex(col)
      g.fillRect(x, y, 1, 1)
    }
  }
  return c.toDataURL()
}

/** Planks: four boards with darker seams and a little grain. */
function planks(seed: number, base: [number, number, number]): string {
  const [c, g] = canvas()
  const r = rng(seed)
  for (let y = 0; y < 16; y++) {
    const seam = y % 4 === 3
    for (let x = 0; x < 16; x++) {
      const board = Math.floor(y / 4)
      const joint = (x + board * 5) % 16 === 0
      let k = 1 + (r() - 0.5) * 0.12
      if (seam) k = 0.62
      else if (joint) k = 0.72
      else if (y % 4 === 0) k += 0.06
      g.fillStyle = hex(shade(base, k))
      g.fillRect(x, y, 1, 1)
    }
  }
  return c.toDataURL()
}

export function installTextures(): void {
  const root = document.documentElement.style
  const set = (name: string, url: string): void => root.setProperty(name, `url(${url})`)
  set('--tex-stone', speckle(11, [118, 118, 118], 0.22, [[96, 96, 96], [140, 140, 140]]))
  set('--tex-stone-dark', speckle(12, [52, 52, 52], 0.2))
  // Season 1 palette: amethyst for the main button, dark purple stone behind menus.
  set('--tex-accent', speckle(13, [146, 64, 206], 0.2, [[196, 128, 250], [104, 38, 156], [224, 170, 255]]))
  set('--tex-menu', speckle(14, [34, 20, 44], 0.3, [[22, 12, 30], [58, 30, 80], [86, 40, 120]]))
  set('--tex-planks', planks(15, [156, 112, 64]))
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const SKIN: [number, number, number][] = [[247, 205, 166], [226, 174, 132], [198, 140, 98], [150, 98, 64], [104, 68, 44]]
const HAIR: [number, number, number][] = [[58, 38, 22], [110, 72, 36], [220, 180, 90], [40, 40, 44], [160, 62, 30], [230, 230, 220]]
const EYES: [number, number, number][] = [[60, 90, 200], [60, 140, 70], [100, 70, 40], [80, 80, 80]]

/** An 8x8 pixel head generated from the nickname, so every player gets their own face. */
export function headFor(name: string): string {
  const [c, g] = canvas(8)
  const h = hash(name.toLowerCase())
  const r = rng(h)
  const skin = SKIN[h % SKIN.length]
  const hair = HAIR[(h >>> 4) % HAIR.length]
  const eye = EYES[(h >>> 8) % EYES.length]
  const px = (x: number, y: number, col: [number, number, number]): void => {
    g.fillStyle = hex(col)
    g.fillRect(x, y, 1, 1)
  }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px(x, y, shade(skin, 1 + (r() - 0.5) * 0.08))
  const fringe = 2 + ((h >>> 12) % 2)
  for (let y = 0; y < fringe; y++) for (let x = 0; x < 8; x++) px(x, y, shade(hair, 1 + (r() - 0.5) * 0.2))
  for (let y = fringe; y < 5; y++) {
    px(0, y, shade(hair, 0.9))
    px(7, y, shade(hair, 0.9))
  }
  px(1, 4, [255, 255, 255])
  px(2, 4, eye)
  px(5, 4, eye)
  px(6, 4, [255, 255, 255])
  px(3, 5, shade(skin, 0.82))
  px(4, 5, shade(skin, 0.82))
  for (let x = 2; x < 6; x++) px(x, 6, shade(skin, 0.6))
  if ((h >>> 16) % 3 === 0) for (let x = 1; x < 7; x++) px(x, 7, shade(hair, 0.85))
  return c.toDataURL()
}
