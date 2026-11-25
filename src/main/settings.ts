import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { totalmem } from 'node:os'
import type { Language, Settings } from '../shared/types'
import { NICKNAME_RE } from '../shared/types'
import { THEME_IDS } from '../shared/theme'
import { paths } from './paths'

function defaultLanguage(): Language {
  const locale = app.getLocale().toLowerCase()
  if (locale.startsWith('uk')) return 'uk'
  if (locale.startsWith('ru')) return 'ru'
  return 'en'
}

export function totalMemoryMb(): number {
  return Math.floor(totalmem() / 1024 / 1024)
}

function defaultMemory(): number {
  // 4 GB is comfortable for this pack; leave room on 8 GB machines.
  return totalMemoryMb() >= 12 * 1024 ? 6144 : 4096
}

function defaults(): Settings {
  return {
    nickname: '',
    language: defaultLanguage(),
    memoryMb: defaultMemory(),
    serverId: 'main',
    optionalMods: {},
    closeOnLaunch: true,
    theme: 'dark'
  }
}

let current: Settings | null = null

export async function loadSettings(): Promise<Settings> {
  if (current) return current
  try {
    const raw = JSON.parse(await readFile(paths.settingsFile, 'utf8'))
    current = sanitize({ ...defaults(), ...raw })
  } catch {
    current = defaults()
  }
  return current
}

function sanitize(s: Settings): Settings {
  const max = Math.max(2048, totalMemoryMb() - 1024)
  return {
    nickname: typeof s.nickname === 'string' && NICKNAME_RE.test(s.nickname) ? s.nickname : '',
    language: (['en', 'uk', 'ru'] as const).includes(s.language) ? s.language : defaultLanguage(),
    memoryMb: Math.min(max, Math.max(2048, Math.round(Number(s.memoryMb) || defaultMemory()))),
    serverId: typeof s.serverId === 'string' ? s.serverId : 'main',
    optionalMods: s.optionalMods && typeof s.optionalMods === 'object' ? s.optionalMods : {},
    closeOnLaunch: s.closeOnLaunch !== false,
    theme: THEME_IDS.includes(s.theme) ? s.theme : 'dark'
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = sanitize({ ...(await loadSettings()), ...patch })
  if (patch.nickname !== undefined && patch.nickname !== '' && next.nickname === '') {
    throw new Error('Invalid nickname')
  }
  current = next
  await mkdir(dirname(paths.settingsFile), { recursive: true })
  await writeFile(paths.settingsFile, JSON.stringify(next, null, 2))
  return next
}
