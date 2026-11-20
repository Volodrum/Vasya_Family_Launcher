import { app } from 'electron'
import { join } from 'node:path'

/** Where the manifest is published. jsDelivr mirrors GitHub and helps where GitHub is slow or blocked. */
export const MANIFEST_URLS = [
  'https://raw.githubusercontent.com/Volodrum/Vasya_Family_Launcher/main/pack/manifest.json',
  'https://cdn.jsdelivr.net/gh/Volodrum/Vasya_Family_Launcher@main/pack/manifest.json'
]

export const USER_AGENT = `VasyaFamilyLauncher/${app.getVersion()}`

/** %APPDATA%\.vasyafamily on Windows. VF_DATA_DIR overrides it in development. */
export function rootDir(): string {
  if (!app.isPackaged && process.env.VF_DATA_DIR) return join(process.env.VF_DATA_DIR, 'game')
  return join(app.getPath('appData'), '.vasyafamily')
}

export const paths = {
  /** Shared Minecraft files: versions, libraries, assets. */
  get minecraft(): string {
    return join(rootDir(), 'minecraft')
  },
  /** The game directory: mods, config, saves, options.txt, resource packs. */
  get instance(): string {
    return join(rootDir(), 'instance')
  },
  get mods(): string {
    return join(rootDir(), 'instance', 'mods')
  },
  get java(): string {
    return join(rootDir(), 'java')
  },
  get state(): string {
    return join(rootDir(), 'state')
  },
  get settingsFile(): string {
    return join(app.getPath('userData'), 'settings.json')
  },
  get manifestCache(): string {
    return join(rootDir(), 'state', 'manifest.json')
  }
}
