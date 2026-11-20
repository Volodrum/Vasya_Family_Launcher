import { useEffect, useState } from 'react'
import type { SkinInfo } from '../../shared/types'

/**
 * Draws pieces of a Minecraft skin (64x64, or the old 64x32 format) into small canvases.
 * The results are shown with image-rendering: pixelated, so they stay sharp at any size.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

type Ctx = CanvasRenderingContext2D

/** Copies a skin region to (dx, dy); `flip` mirrors it, for old skins that have only right limbs. */
function part(g: Ctx, img: HTMLImageElement, sx: number, sy: number, w: number, h: number, dx: number, dy: number, flip = false): void {
  if (!flip) {
    g.drawImage(img, sx, sy, w, h, dx, dy, w, h)
    return
  }
  g.save()
  g.translate(dx + w, dy)
  g.scale(-1, 1)
  g.drawImage(img, sx, sy, w, h, 0, 0, w, h)
  g.restore()
}

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  return [c, g]
}

/**
 * Whether to draw the hat layer. Like the game, an old 64x32 skin whose hat area has no
 * transparent pixels at all is treated as having no hat (many old skins fill it with black).
 */
function hatUsable(img: HTMLImageElement): boolean {
  if (img.height >= 64) return true
  const [, g] = canvas(32, 16)
  g.drawImage(img, 32, 0, 32, 16, 0, 0, 32, 16)
  const data = g.getImageData(0, 0, 32, 16).data
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) return true
  return false
}

/** 8x8 face with the hat layer on top. */
export async function renderHead(skin: SkinInfo): Promise<string> {
  const img = await loadImage(skin.png)
  const [c, g] = canvas(8, 8)
  part(g, img, 8, 8, 8, 8, 0, 0)
  if (hatUsable(img)) part(g, img, 40, 8, 8, 8, 0, 0)
  return c.toDataURL()
}

/** 16x32 front view of the whole player, with the outer layers on 64x64 skins. */
export async function renderBody(skin: SkinInfo): Promise<string> {
  const img = await loadImage(skin.png)
  const modern = img.height >= 64
  const arm = skin.slim ? 3 : 4
  const [c, g] = canvas(16, 32)
  const ax = 4 - arm // right arm hugs the body: x = 4 - arm .. 4

  // Head
  part(g, img, 8, 8, 8, 8, 4, 0)
  // Body
  part(g, img, 20, 20, 8, 12, 4, 8)
  // Right arm (viewer's left) and left arm
  part(g, img, 44, 20, arm, 12, ax, 8)
  if (modern) part(g, img, 36, 52, arm, 12, 12, 8)
  else part(g, img, 44, 20, arm, 12, 12, 8, true)
  // Right leg and left leg
  part(g, img, 4, 20, 4, 12, 4, 20)
  if (modern) part(g, img, 20, 52, 4, 12, 8, 20)
  else part(g, img, 4, 20, 4, 12, 8, 20, true)

  // Outer layers
  if (hatUsable(img)) part(g, img, 40, 8, 8, 8, 4, 0) // hat
  if (modern) {
    part(g, img, 20, 36, 8, 12, 4, 8) // jacket
    part(g, img, 44, 36, arm, 12, ax, 8) // right sleeve
    part(g, img, 52, 52, arm, 12, 12, 8) // left sleeve
    part(g, img, 4, 36, 4, 12, 4, 20) // right pants
    part(g, img, 4, 52, 4, 12, 8, 20) // left pants
  }
  return c.toDataURL()
}

/**
 * The skin for a nickname, looked up by the main process (Mojang, then Ely.by).
 * `undefined` while loading, `null` when the name has no skin.
 */
export function useSkin(nickname: string, delayMs = 0): SkinInfo | null | undefined {
  const [skin, setSkin] = useState<SkinInfo | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    setSkin(undefined)
    const timer = setTimeout(() => {
      window.vf
        .getSkin(nickname)
        .then((s) => alive && setSkin(s))
        .catch(() => alive && setSkin(null))
    }, delayMs)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [nickname, delayMs])
  return skin
}

/** Renders a skin piece to a data URL once the skin is known. */
export function useRendered(skin: SkinInfo | null | undefined, render: (s: SkinInfo) => Promise<string>): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    if (skin) render(skin).then((u) => alive && setUrl(u)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [skin, render])
  return url
}
