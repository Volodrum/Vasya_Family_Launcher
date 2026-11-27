import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import electronUpdater from 'electron-updater'
import type { GameEvent, LauncherState, NoticeEvent, PackManifest, PlayMode, ProgressEvent, Settings, Stage, UpdateEvent } from '../shared/types'
import { loadSettings, saveSettings, totalMemoryMb } from './settings'
import { fetchManifest, selectMods } from './manifest'
import { syncMods } from './mods'
import { syncPacks } from './packs'
import { MENU_PACK, writeMenu } from './menu'
import { unifyJourneyMapWorlds } from './journeymap'
import { ensureJava, ensureMinecraft, launchGame } from './game'
import { paths } from './paths'
import { THEMES, type ThemeId } from '../shared/theme'
import { getSkin } from './skins'
import { findRunningGame, forgetGame, rememberGame, watchExit } from './running'
import icon from '../../build/icon.ico?asset'

const { autoUpdater } = electronUpdater

// Development: keep test runs (settings + game files) out of the real profile.
if (!app.isPackaged && process.env.VF_DATA_DIR) app.setPath('userData', join(process.env.VF_DATA_DIR, 'userdata'))

let win: BrowserWindow | null = null
let manifest: PackManifest | null = null
let manifestError: string | null = null
let busy = false
let gameRunning = false
/** Startup check for a game left running by an earlier launcher run; Play waits for it. */
let adopting: Promise<void> = Promise.resolve()

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

let lastLogged = ''
const progress = (e: ProgressEvent): void => {
  send('vf:progress', e)
  if (process.env.VF_AUTOPLAY) {
    // Log stage changes and every ~10% so a headless test run can be followed.
    const line = `${e.stage} ${e.fraction < 0 ? '...' : Math.floor(e.fraction * 10) * 10 + '%'} ${e.detail ?? ''}`
    if (line !== lastLogged) console.log('[progress]', (lastLogged = line))
  }
}
const report = (stage: Stage, fraction: number, detail?: string): void => progress({ stage, fraction, detail })

async function loadManifest(): Promise<void> {
  try {
    manifest = await fetchManifest()
    manifestError = null
  } catch (e) {
    manifestError = (e as Error).message
  }
}

async function state(): Promise<LauncherState> {
  return {
    appVersion: app.getVersion(),
    settings: await loadSettings(),
    manifest,
    manifestError,
    totalMemoryMb: totalMemoryMb(),
    gameRunning
  }
}

function gameEnded(): void {
  gameRunning = false
  void forgetGame()
  report('idle', 1)
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
  }
}

/** A game started by an earlier launcher run is still open: stay locked until it closes. */
async function adoptRunningGame(): Promise<void> {
  const pid = await findRunningGame()
  if (pid === null || gameRunning) return
  gameRunning = true
  report('running', 1)
  send('vf:game', { type: 'started' } satisfies GameEvent)
  watchExit(pid, () => {
    if (!gameRunning) return
    gameEnded()
    send('vf:game', { type: 'exited' } satisfies GameEvent)
  })
}

/** Full pipeline: manifest -> Java -> Minecraft + Fabric -> mods (strict sync) -> launch. */
async function play(mode: PlayMode | 'repair'): Promise<void> {
  const repair = mode === 'repair'
  await adopting
  if (busy || gameRunning) return
  busy = true
  try {
    const settings: Settings = await loadSettings()
    if (!settings.nickname) throw new Error('Set a nickname first')

    report('manifest', -1)
    await loadManifest()
    if (!manifest) throw new Error(manifestError ?? 'No modpack list')
    const m = manifest

    const javaPath = await ensureJava(m, report, repair)
    const version = await ensureMinecraft(m, report, repair)

    const wanted = selectMods(m, settings)
    const sync = await syncMods(paths.mods, wanted, (fraction, detail) => report('mods', fraction, detail))
    const installed = wanted.filter((mod) => !sync.skipped.includes(mod.name))
    await mkdir(join(paths.instance, 'resourcepacks'), { recursive: true })
    await mkdir(join(paths.instance, 'shaderpacks'), { recursive: true })
    // Resource packs and shaders from the pack; a failed download never blocks the game.
    try {
      const packs = await syncPacks(m, paths.instance, join(paths.state, 'packs.json'), (fraction, detail) => report('packs', fraction, detail), [MENU_PACK])
      if (packs.failed.length) console.warn('[packs] could not download:', packs.failed.join(', '))
      if (packs.removed.length) send('vf:notice', { type: 'packs-removed', names: packs.removed } satisfies NoticeEvent)
    } catch (e) {
      console.warn('[packs]', (e as Error).message)
    }
    // The in-game main and pause menus (FancyMenu); the game still works with the plain menus if this fails.
    try {
      const server = m.servers.find((s) => s.id === settings.serverId) ?? m.servers[0]
      await writeMenu(paths.instance, { theme: settings.theme, language: settings.language, address: server.address })
    } catch (e) {
      console.warn('[menu]', (e as Error).message)
    }
    // One JourneyMap map per server world, whichever connection or join path was used.
    try {
      const jm = await unifyJourneyMapWorlds(paths.instance, m.servers.map((s) => s.address))
      if (jm.merged.length || jm.linked.length) console.log('[journeymap] merged', jm.merged, 'linked', jm.linked)
    } catch (e) {
      console.warn('[journeymap]', (e as Error).message)
    }

    if (mode === 'repair') {
      report('idle', 1)
      return
    }

    report('launching', -1)
    const proc = await launchGame({
      manifest: m,
      settings,
      mode,
      javaPath,
      version,
      modSha1s: installed.map((mod) => mod.sha1),
      onEvent: (e: GameEvent) => {
        if (e.type === 'started') {
          gameRunning = true
          report('running', 1)
        }
        if (e.type === 'window-ready' && settings.closeOnLaunch) win?.hide()
        if (e.type === 'exited' || e.type === 'error') gameEnded()
        if (process.env.VF_AUTOPLAY) console.log('[game]', JSON.stringify(e).slice(0, 500))
        send('vf:game', e)
      }
    })
    if (gameRunning && proc.pid) await rememberGame(proc.pid).catch((err) => console.warn('[game] could not save PID:', err))
  } catch (e) {
    progress({ stage: 'error', fraction: 0, detail: (e as Error).message })
    throw e
  } finally {
    busy = false
  }
}

function registerIpc(): void {
  // Waits for the running-game check so the first screen already shows a game left open.
  ipcMain.handle('vf:getState', async () => {
    await adopting
    return state()
  })
  ipcMain.handle('vf:getSkin', (_e, nickname: unknown) => (typeof nickname === 'string' ? getSkin(nickname) : null))
  ipcMain.handle('vf:saveSettings', (_e, patch: Partial<Settings>) => saveSettings(patch))
  ipcMain.handle('vf:refreshManifest', async () => {
    await loadManifest()
    return state()
  })
  ipcMain.handle('vf:play', (_e, mode: PlayMode) => play(mode === 'local' ? 'local' : 'server'))
  ipcMain.handle('vf:repair', () => play('repair'))
  ipcMain.handle('vf:openFolder', async (_e, which: string) => {
    const allowed: Record<string, string> = {
      game: paths.instance,
      logs: join(paths.instance, 'logs'),
      resourcepacks: join(paths.instance, 'resourcepacks'),
      shaderpacks: join(paths.instance, 'shaderpacks'),
      screenshots: join(paths.instance, 'screenshots')
    }
    const dir = allowed[which]
    if (!dir) return
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })
  // Restarting mid-install would leave a half-downloaded game; in that case it installs on quit instead.
  ipcMain.handle('vf:installUpdate', () => {
    if (!busy) autoUpdater.quitAndInstall(true, true)
  })
  ipcMain.on('vf:minimize', () => win?.minimize())
  ipcMain.on('vf:close', () => win?.close())
}

/**
 * Launcher self-update from GitHub Releases (the newest full release; the `pack-files`
 * pre-release is ignored). Updates download in the background; the player can restart
 * right away from the toast, or the update installs the next time the launcher closes.
 */
function setupUpdater(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  let announced = ''
  autoUpdater.on('update-available', (i) => {
    if (announced === i.version) return
    announced = i.version
    send('vf:update', { type: 'available', version: i.version } satisfies UpdateEvent)
  })
  autoUpdater.on('update-downloaded', (i) => send('vf:update', { type: 'downloaded', version: i.version } satisfies UpdateEvent))
  // Offline or GitHub unreachable: stay quiet and try again at the next check.
  autoUpdater.on('error', (err) => console.warn('[updater]', err.message))
  const check = (): void => void autoUpdater.checkForUpdates().catch(() => undefined)
  check()
  // A launcher left open (e.g. hidden while playing) still notices new versions.
  setInterval(check, 2 * 60 * 60 * 1000)
}

function createWindow(theme: ThemeId): void {
  win = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 900,
    minHeight: 580,
    frame: false,
    // Paper colour of the chosen theme, so the window does not flash another colour while it loads.
    backgroundColor: THEMES[theme].paper,
    show: false,
    title: 'Vasya Family Launcher',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win?.show())
  // Links open in the real browser, never inside the launcher.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Development aid: VF_SCREENSHOTS=<dir> saves screenshots of the main screens, then quits.
  const shotsDir = !app.isPackaged ? process.env.VF_SCREENSHOTS : undefined
  if (shotsDir) {
    win.webContents.once('did-finish-load', async () => {
      const w = win!
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const shot = async (name: string) => writeFile(join(shotsDir, `${name}.png`), (await w.webContents.capturePage()).toPNG())
      const click = (id: string) =>
        w.webContents.executeJavaScript(`(() => { const b = document.querySelector('[data-testid="${id}"]'); b?.click(); return !!b })()`)
      await mkdir(shotsDir, { recursive: true })
      // A window covered by other windows counts as hidden and stops painting, so captures would be stale.
      w.setAlwaysOnTop(true)
      w.focus()
      await wait(1800)
      await shot('1-first')
      if (await click('options')) {
        await wait(600)
        await shot('2-options')
        await click('mods')
        await wait(600)
        await shot('3-mods')
        await click('done')
        await wait(300)
        // The title screen in each theme, switched from Options (the loop ends where it started).
        for (const [button, count] of [['theme', 2]] as const) {
          for (let i = 1; i <= count; i++) {
            await click(button)
            await wait(250)
            await click('done')
            await wait(500)
            await shot(`look-${button}-${i}`)
            await click('options')
            await wait(300)
          }
        }
        await click('done')
        await wait(400)
        report('mods', 0.42, 'Tech Reborn')
        await wait(600)
        await shot('4-loading')
        progress({ stage: 'error', fraction: 0, detail: 'Could not download Tech Reborn: cdn.modrinth.com: HTTP 503' })
        await wait(800)
        await shot('5-error')
        report('idle', 1)
        await wait(300)
        if (await click('change-nick')) {
          await wait(3500)
          await shot('6-nickname')
        }
      }
      app.quit()
    })
  }

  // Development aid: VF_AUTOPLAY=1 starts the full install + launch without clicking.
  // VF_AUTOPLAY=server joins the first server in the manifest instead: use it only with a test
  // VF_MANIFEST_FILE whose server list points at a local test server.
  const autoplay = !app.isPackaged ? process.env.VF_AUTOPLAY : undefined
  if (autoplay === '1' || autoplay === 'server') {
    win.webContents.once('did-finish-load', () => {
      // Singleplayer by default, so a test run never joins the real server.
      play(autoplay === 'server' ? 'server' : 'local').catch((e) => console.error('[autoplay]', e))
    })
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      win.show()
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(async () => {
    app.setAppUserModelId('ua.vasyafamily.launcher')
    registerIpc()
    adopting = adoptRunningGame().catch((err) => console.warn('[game] running-game check failed:', err))
    await loadManifest()
    createWindow((await loadSettings()).theme)
    setupUpdater()
  })
  app.on('window-all-closed', () => app.quit())
}
