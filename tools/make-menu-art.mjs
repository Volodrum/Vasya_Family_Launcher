// Draws the pictures for the in-game menus (FancyMenu) from the launcher's own art, so the game
// matches the launcher: the crystal-cave background and the "VASYA FAMILY / SEASON 01" logo in
// both themes, plus small printed button textures. Writes them to src/main/menu-assets/.
//   npx electron tools/make-menu-art.mjs
// (Electron is needed to render the SVG scene and the Rizba font; the button textures are plain pixels.)
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(root, 'src/main/menu-assets')
const themes = JSON.parse(
  ts.transpileModule(fs.readFileSync(path.join(root, 'src/shared/theme.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } })
    .outputText.match(/exports\.THEMES = (\{[\s\S]*?\n\});/)[1]
    .replace(/(\w+):/g, '"$1":')
    .replace(/'/g, '"')
)

// ---------- button textures (pixel art, 9-sliced by FancyMenu) ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
function png(w, h, pixel) {
  const raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(pixel(x, y), y * (w * 4 + 1) + 1 + x * 4)
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
/** A 40x20 printed block: fill, 2px ink border; `shadow` adds a 2px ink drop shadow (the main button). */
function button(fill, ink, shadow) {
  const W = 40, H = 20, s = shadow ? 2 : 0
  return png(W, H, (x, y) => {
    if (x >= W - s || y >= H - s) return x >= s && y >= s ? [...hex(ink), 255] : [0, 0, 0, 0]
    const edge = x < 2 || y < 2 || x >= W - s - 2 || y >= H - s - 2
    return [...hex(edge ? ink : fill), 255]
  })
}

// ---------- background and logo (rendered in Chromium) ----------
const scenes = ts.transpileModule(fs.readFileSync(path.join(root, 'src/renderer/src/scenes.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText.replace(/^export /gm, '')
const artTsx = fs.readFileSync(path.join(root, 'src/renderer/src/art.tsx'), 'utf8')
const filters = artTsx.slice(artTsx.indexOf('<filter id="vf-rough"'), artTsx.indexOf('{/* Coloured with inline styles')).replace(/\{(\d+(?:\.\d+)?)\}/g, '"$1"').replace(/numOctaves=/g, 'numOctaves=')
const rizba = fs.readFileSync(path.join(root, 'src/renderer/src/assets/fonts/Rizba.otf')).toString('base64')

const page = `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:Rizba;src:url(data:font/otf;base64,${rizba}) format('opentype')}</style></head><body>
<svg id="defs" width="0" height="0" style="position:absolute"><defs>${filters}</defs></svg>
<svg id="scene" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 680" width="1920" height="1080" preserveAspectRatio="xMidYMax slice"></svg>
<script type="module">
${scenes}
window.render = async (t) => {
  const svg = document.getElementById('scene')
  drawScene(svg)
  const css = '.i{fill:' + t.ink + '}.a{fill:' + t.acc + '}.p{fill:' + t.paper + '}.si{stroke:' + t.ink + '}.sp{stroke:' + t.paper + '}.sa{stroke:' + t.acc + '}.nf{fill:none}'
  const src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 680" width="1920" height="1080" preserveAspectRatio="xMidYMax slice"><style>' + css + '</style><rect width="1100" height="680" fill="' + t.paper + '"/>' + document.getElementById('defs').innerHTML + svg.innerHTML + '</svg>'
  const img = new Image()
  await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src) })
  const bg = document.createElement('canvas'); bg.width = 1920; bg.height = 1080
  bg.getContext('2d').drawImage(img, 0, 0)

  await document.fonts.load('100px Rizba')
  const logo = document.createElement('canvas'); logo.width = 800; logo.height = 420
  const g = logo.getContext('2d')
  g.filter = 'url(#vf-rough)'
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'
  g.font = '170px Rizba'
  for (const [dx, dy, col] of [[9, 7, t.acc], [0, 0, t.ink]]) { g.fillStyle = col; g.fillText('VASYA', 400 + dx, 150 + dy); g.fillText('FAMILY', 400 + dx, 300 + dy) }
  g.filter = 'none'
  g.font = '34px Rizba'
  const label = 'S E A S O N   0 1', w = g.measureText(label).width + 44
  g.fillStyle = t.ink; g.fillRect(400 - w / 2, 330, w, 56)
  g.fillStyle = t.paper; g.fillText(label, 400, 370)
  return { bg: bg.toDataURL('image/png').split(',')[1], logo: logo.toDataURL('image/png').split(',')[1] }
}
window.ready = true
</script></body></html>`

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const win = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html;base64,' + Buffer.from(page).toString('base64'))
  for (let i = 0; i < 50 && !(await win.webContents.executeJavaScript('!!window.ready')); i++) await new Promise((r) => setTimeout(r, 100))
  for (const [name, t] of Object.entries(themes)) {
    const out = await win.webContents.executeJavaScript(`render(${JSON.stringify(t)})`)
    fs.writeFileSync(path.join(OUT, `bg_${name}.png`), Buffer.from(out.bg, 'base64'))
    fs.writeFileSync(path.join(OUT, `logo_${name}.png`), Buffer.from(out.logo, 'base64'))
    fs.writeFileSync(path.join(OUT, `button_${name}.png`), button(t.paper, t.ink, false))
    fs.writeFileSync(path.join(OUT, `button_hover_${name}.png`), button(t.ink, t.ink, false))
    fs.writeFileSync(path.join(OUT, `button_accent_${name}.png`), button(t.acc, t.ink, true))
    fs.writeFileSync(path.join(OUT, `button_accent_hover_${name}.png`), button(t.acc, t.paper, true))
  }
  for (const f of fs.readdirSync(OUT)) console.log(f.padEnd(28), fs.statSync(path.join(OUT, f)).size, 'bytes')
  app.quit()
})
