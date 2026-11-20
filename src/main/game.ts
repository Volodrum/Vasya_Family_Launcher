import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import {
  MinecraftFolder,
  Version,
  launch,
  createMinecraftProcessWatcher,
  type ResolvedVersion
} from '@xmcl/core'
import {
  DEFAULT_RUNTIME_ALL_URL,
  ProgressTrackerMultiple,
  createDefaultNodeInstallRuntime,
  createFabricInstallWorkflow,
  createJavaRuntimeInstallWorkflow,
  executeInstallManifest,
  executeInstallWorkflow,
  getVersionList,
  resolveAssetMetadataInstallFiles,
  resolveAssetObjectInstallFiles,
  resolveLibraryInstallFiles,
  resolveMinecraftJarInstallFile,
  resolveMinecraftVersionJsonInstallFile,
  type InstallFile,
  type JavaRuntimeTarget,
  type JavaRuntimes
} from '@xmcl/installer'
import type { GameEvent, PackManifest, PlayMode, Settings, Stage } from '../shared/types'
import { USER_AGENT, paths } from './paths'

export type Report = (stage: Stage, fraction: number, detail?: string) => void

/** Runs install work while reporting byte progress from the shared tracker. */
async function tracked<T>(stage: Stage, report: Report, work: (tracker: ProgressTrackerMultiple) => Promise<T>): Promise<T> {
  const tracker = new ProgressTrackerMultiple()
  report(stage, -1)
  const timer = setInterval(() => {
    const { progress, total } = tracker
    report(stage, total > 0 ? Math.min(1, progress / total) : -1)
  }, 250)
  try {
    return await work(tracker)
  } finally {
    clearInterval(timer)
    report(stage, 1)
  }
}

function runtimeFor(tracker: ProgressTrackerMultiple) {
  return createDefaultNodeInstallRuntime({ tracker, maxConcurrency: 16 })
}

async function readMarker(name: string): Promise<string | null> {
  try {
    return (await readFile(join(paths.state, name), 'utf8')).trim()
  } catch {
    return null
  }
}

async function writeMarker(name: string, value: string): Promise<void> {
  await mkdir(paths.state, { recursive: true })
  await writeFile(join(paths.state, name), value)
}

function javaPlatformKey(): keyof JavaRuntimes {
  if (process.platform === 'win32') return process.arch === 'arm64' ? 'windows-arm64' : process.arch === 'ia32' ? 'windows-x86' : 'windows-x64'
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  return 'linux'
}

/** Installs Mojang's own Java runtime for this Minecraft version into the launcher folder. */
export async function ensureJava(manifest: PackManifest, report: Report, force = false): Promise<string> {
  const component = manifest.java.component
  const destination = join(paths.java, component)
  const exe = process.platform === 'win32' ? join(destination, 'bin', 'javaw.exe') : join(destination, 'bin', 'java')
  const marker = `java-${component}.txt`
  if (!force && existsSync(exe) && (await readMarker(marker))) return exe

  const res = await fetch(DEFAULT_RUNTIME_ALL_URL, { headers: { 'user-agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Java runtime list: HTTP ${res.status}`)
  const all = (await res.json()) as JavaRuntimes
  const target: JavaRuntimeTarget | undefined = all[javaPlatformKey()]?.[component]?.[0]
  if (!target) throw new Error(`No Java ${manifest.java.major} runtime for this system`)

  await tracked('java', report, (tracker) =>
    executeInstallWorkflow(createJavaRuntimeInstallWorkflow({ target, destination }), runtimeFor(tracker))
  )
  if (!existsSync(exe)) throw new Error('Java was installed but the executable is missing')
  await writeMarker(marker, target.version.name)
  return exe
}

/** Installs vanilla Minecraft, the Fabric loader, libraries and assets. Returns the version to launch. */
export async function ensureMinecraft(manifest: PackManifest, report: Report, force = false): Promise<ResolvedVersion> {
  const mc = MinecraftFolder.from(paths.minecraft)
  const fabricId = `fabric-loader-${manifest.loader.version}-${manifest.minecraft}`
  const marker = `game-${fabricId}.txt`

  if (!force && (await readMarker(marker))) {
    try {
      return await Version.parse(mc, fabricId)
    } catch {
      /* fall through to a full install */
    }
  }

  const exec = (tracker: ProgressTrackerMultiple, id: string, files: InstallFile[]) =>
    executeInstallManifest({ schemaVersion: 1, tasks: [{ id, type: 'files', files }] }, runtimeFor(tracker))

  await tracked('minecraft', report, async (tracker) => {
    const list = await getVersionList()
    const meta = list.versions.find((v) => v.id === manifest.minecraft)
    if (!meta) throw new Error(`Minecraft ${manifest.minecraft} not found`)
    await exec(tracker, 'version-json', [resolveMinecraftVersionJsonInstallFile(meta, mc)])
  })

  const installedId = await tracked('loader', report, (tracker) =>
    executeInstallWorkflow(
      createFabricInstallWorkflow({ minecraftVersion: manifest.minecraft, version: manifest.loader.version, minecraft: mc }),
      runtimeFor(tracker)
    )
  )

  const resolved = await Version.parse(mc, installedId)
  await tracked('minecraft', report, async (tracker) => {
    const jar = resolveMinecraftJarInstallFile(resolved)
    await exec(tracker, 'jar-libraries', [...(jar ? [jar] : []), ...resolveLibraryInstallFiles(resolved.libraries, mc)])
  })
  await tracked('assets', report, async (tracker) => {
    await exec(tracker, 'asset-index', resolveAssetMetadataInstallFiles(resolved, mc))
    await exec(tracker, 'assets', await resolveAssetObjectInstallFiles(resolved, mc))
  })

  await writeMarker(marker, new Date().toISOString())
  return resolved
}

/** The UUID an offline-mode server assigns to this name, so inventories stay attached to it. */
export function offlineUuid(name: string): string {
  const md5 = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  md5[6] = (md5[6] & 0x0f) | 0x30
  md5[8] = (md5[8] & 0x3f) | 0x80
  return md5.toString('hex')
}

export interface LaunchArgs {
  manifest: PackManifest
  settings: Settings
  mode: PlayMode
  javaPath: string
  version: ResolvedVersion
  onEvent: (e: GameEvent) => void
}

export async function launchGame({ manifest, settings, mode, javaPath, version, onEvent }: LaunchArgs): Promise<ChildProcess> {
  const server = mode === 'server' ? (manifest.servers.find((s) => s.id === settings.serverId) ?? manifest.servers[0]) : undefined
  const logDir = join(paths.instance, 'logs')
  await mkdir(logDir, { recursive: true })
  const logFile = join(logDir, 'launcher-game.log')
  await writeFile(logFile, `--- ${new Date().toISOString()} ${version.id} -> ${server?.address ?? 'menu'}\n`)

  const proc = await launch({
    gamePath: paths.instance,
    resourcePath: paths.minecraft,
    javaPath,
    version,
    gameProfile: { name: settings.nickname, id: offlineUuid(settings.nickname) },
    accessToken: randomBytes(16).toString('hex'),
    userType: 'legacy',
    minMemory: 1024,
    maxMemory: settings.memoryMb,
    quickPlayMultiplayer: server?.address,
    launcherName: 'vasya-family-launcher',
    launcherBrand: 'VasyaFamily',
    versionName: manifest.name,
    extraJVMArgs: ['-XX:+UseG1GC', '-XX:+UnlockExperimentalVMOptions', '-XX:G1NewSizePercent=20', '-XX:MaxGCPauseMillis=50'],
    extraExecOption: { detached: true }
  })

  const log = (chunk: Buffer) => void appendFile(logFile, chunk).catch(() => undefined)
  proc.stdout?.on('data', log)
  proc.stderr?.on('data', log)

  const watcher = createMinecraftProcessWatcher(proc)
  watcher.on('minecraft-window-ready', () => onEvent({ type: 'window-ready' }))
  watcher.on('minecraft-exit', ({ code, crashReport }) => onEvent({ type: 'exited', code, crashReport }))
  watcher.on('error', (err) => onEvent({ type: 'error', message: String(err?.message ?? err) }))
  onEvent({ type: 'started' })
  return proc
}
