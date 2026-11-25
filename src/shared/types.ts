/** Types shared by the main process, preload and the UI. */
import type { ThemeId } from './theme'

export type Language = 'en' | 'uk' | 'ru'

export interface ModEntry {
  id: string
  name: string
  version: string
  file: string
  size: number
  sha1: string
  sha512?: string
  side: 'client' | 'both'
  optional: boolean
  default: boolean
  /** Other optional mods this one needs (Iris needs Sodium). */
  requires: string[]
  /** Tried in order; every download is checked against sha1. */
  downloads: string[]
  source?: { type: string; [key: string]: unknown }
}

/** A resource pack or shader pack the launcher installs next to the player's own packs. */
export interface PackFileEntry {
  /** Stable id (Modrinth project slug or file stem); lets a renamed update replace the old file. */
  id: string
  name: string
  version: string
  file: string
  size: number
  sha1: string
  sha512?: string
  /** Tried in order; every download is checked against sha1. */
  downloads: string[]
  source?: { type: string; [key: string]: unknown }
  /** Resource packs only: switched on the first time the launcher installs it. */
  enabled?: boolean
}

export interface ServerEntry {
  id: string
  name: string
  address: string
}

export interface PackManifest {
  schema: 1
  name: string
  packVersion: string
  generatedAt: string
  minecraft: string
  loader: { type: 'fabric'; version: string }
  java: { component: string; major: number }
  servers: ServerEntry[]
  policy: {
    mods: 'strict'
    resourcepacks: 'any' | 'whitelist' | 'none'
    shaderpacks: 'any' | 'whitelist' | 'none'
  }
  mods: ModEntry[]
  /** Installed into resourcepacks/, listed bottom-to-top (the last one has the highest priority). Players' own packs are left alone. */
  resourcepacks?: PackFileEntry[]
  /** Installed into shaderpacks/. */
  shaderpacks?: PackFileEntry[]
  /** First-run shader choice: which pack Iris selects and whether shaders start on. */
  shaders?: { default?: string; enabled?: boolean }
}

export interface Settings {
  nickname: string
  language: Language
  memoryMb: number
  serverId: string
  /** Choices for optional mods; missing ids use the mod's default. */
  optionalMods: Record<string, boolean>
  closeOnLaunch: boolean
  /** Light or dark print (see shared/theme.ts). */
  theme: ThemeId
}

export type PlayMode = 'server' | 'local'

export type Stage =
  | 'idle'
  | 'manifest'
  | 'java'
  | 'minecraft'
  | 'loader'
  | 'assets'
  | 'mods'
  | 'packs'
  | 'launching'
  | 'running'
  | 'error'

export interface ProgressEvent {
  stage: Stage
  /** 0..1, or -1 when unknown. */
  fraction: number
  detail?: string
}

export interface GameEvent {
  type: 'started' | 'window-ready' | 'exited' | 'error'
  code?: number
  message?: string
  crashReport?: string
}

export interface UpdateEvent {
  type: 'available' | 'downloaded' | 'error'
  version?: string
  message?: string
}

/** Something the player should know about that is not an error. */
export interface NoticeEvent {
  type: 'packs-removed'
  /** Resource/shader packs moved to the game folder's removed-packs (packs are locked to the pack's own). */
  names: string[]
}

export interface LauncherState {
  appVersion: string
  settings: Settings
  manifest: PackManifest | null
  manifestError: string | null
  totalMemoryMb: number
  gameRunning: boolean
}

/** A player's skin, found by nickname (no login). `png` is a data: URL of the skin image. */
export interface SkinInfo {
  png: string
  slim: boolean
  source: 'mojang' | 'ely.by'
}

export interface LauncherApi {
  getSkin(nickname: string): Promise<SkinInfo | null>
  getState(): Promise<LauncherState>
  saveSettings(patch: Partial<Settings>): Promise<Settings>
  refreshManifest(): Promise<LauncherState>
  /** 'server' joins the selected server directly; 'local' opens the main menu for singleplayer. */
  play(mode: PlayMode): Promise<void>
  repair(): Promise<void>
  openFolder(which: 'game' | 'logs' | 'resourcepacks' | 'shaderpacks' | 'screenshots'): Promise<void>
  installUpdate(): Promise<void>
  minimize(): void
  close(): void
  onProgress(cb: (e: ProgressEvent) => void): () => void
  onGame(cb: (e: GameEvent) => void): () => void
  onUpdate(cb: (e: UpdateEvent) => void): () => void
  onNotice(cb: (e: NoticeEvent) => void): () => void
}

export const NICKNAME_RE = /^[A-Za-z0-9_]{3,16}$/
