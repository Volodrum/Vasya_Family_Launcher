// Draws the launcher icon: the "double-rim V" re-cut as a linocut (accent rim, paper gap, ink V with
// carved lines), the same drawing as the title-bar logo (symbol #vf-v in src/renderer/src/art.tsx),
// in the dark theme's colours. Writes build/icon.png (512) and build/icon.ico (16-256), which
// electron-builder puts into the exe, installer and shortcuts, and the main process uses for the window.
//   npx electron tools/make-icon.mjs            (add --preview for build/icon-preview.png, all sizes side by side)
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
// Dark theme (src/shared/theme.ts): cream ink, near-black paper, vermilion accent.
const C = { paper: '#1b1916', ink: '#ece2cc', acc: '#e0533a' }
// Same paths as the #vf-v symbol, on a 100x100 grid.
const RIM = 'M4 10 L36 10 L50 46 L64 10 L96 10 L62 94 L38 94 Z'
const GAP = 'M14 17 L32 17 L50 62 L68 17 L86 17 L58 87 L42 87 Z'
const V = 'M21 22 L31 22 L50 70 L69 22 L79 22 L55 82 L45 82 Z'
const CARVE = 'M28 28 L44 68 M33 26 L47 62 M72 28 L56 68'

// Windows picks the nearest size, so the in-between ones keep it sharp at 125/150% scaling.
const SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]

const page = `<!doctype html><script>
window.draw = (size, c, paths) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = size
  const g = cv.getContext('2d')
  g.scale(size / 100, size / 100)
  // Small icons: fill the square a little more so the V reads on the taskbar.
  if (size <= 24) { g.translate(50, 52); g.scale(1.08, 1.08); g.translate(-50, -52) }
  g.fillStyle = c.acc; g.fill(new Path2D(paths.rim))
  g.fillStyle = c.paper; g.fill(new Path2D(paths.gap))
  g.fillStyle = c.ink; g.fill(new Path2D(paths.v))
  // The carved lines only where they are more than a hair thick.
  if (size >= 48) { g.strokeStyle = c.paper; g.lineWidth = 2.5; g.lineCap = 'butt'; g.stroke(new Path2D(paths.carve)) }
  return cv.toDataURL('image/png').split(',')[1]
}
window.ready = true
</script>`

function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(pngs.length, 4)
  let off = head.length
  pngs.forEach(([size, img], i) => {
    const e = 6 + 16 * i
    head[e] = size >= 256 ? 0 : size
    head[e + 1] = size >= 256 ? 0 : size
    head.writeUInt16LE(1, e + 4)
    head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(img.length, e + 8)
    head.writeUInt32LE(off, e + 12)
    off += img.length
  })
  return Buffer.concat([head, ...pngs.map(([, img]) => img)])
}

const out = (rel, data) => {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, data)
  console.log(rel, data.length, 'bytes')
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html;base64,' + Buffer.from(page).toString('base64'))
  const paths = JSON.stringify({ rim: RIM, gap: GAP, v: V, carve: CARVE })
  const draw = async (size) => Buffer.from(await win.webContents.executeJavaScript(`draw(${size}, ${JSON.stringify(C)}, ${paths})`), 'base64')
  const pngs = []
  for (const s of SIZES) pngs.push([s, await draw(s)])
  out('build/icon.png', await draw(512))
  out('build/icon.ico', ico(pngs))
  if (process.argv.includes('--preview')) {
    // All sizes side by side on light and dark backgrounds, to check them by eye.
    const html = `<body style="margin:0;display:grid;grid-template-rows:1fr 1fr;width:900px;height:640px">${['#f3f3f3', '#202020']
      .map((bg) => `<div style="background:${bg};display:flex;align-items:center;gap:18px;padding:0 18px">${pngs.map(([s, img]) => `<img width="${s}" height="${s}" src="data:image/png;base64,${img.toString('base64')}">`).join('')}</div>`)
      .join('')}</body>`
    const pv = new BrowserWindow({ show: false, width: 900, height: 640, webPreferences: { offscreen: true } })
    await pv.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'))
    await new Promise((r) => setTimeout(r, 500))
    out('build/icon-preview.png', (await pv.webContents.capturePage()).toPNG())
  }
  app.quit()
})
