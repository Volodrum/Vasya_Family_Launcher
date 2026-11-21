import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ModEntry, PackManifest, Settings } from '../shared/types'
import { MANIFEST_URLS, USER_AGENT, paths } from './paths'

function validate(m: unknown): PackManifest {
  const x = m as PackManifest
  if (!x || x.schema !== 1 || !x.minecraft || !x.loader?.version || !Array.isArray(x.mods)) {
    throw new Error('Manifest has an unexpected format')
  }
  for (const mod of x.mods) {
    if (!mod.file || !/^[0-9a-f]{40}$/.test(mod.sha1) || !mod.downloads?.length) {
      throw new Error(`Manifest entry for ${mod.id ?? '?'} is incomplete`)
    }
    // A manifest must never be able to write outside the mods folder.
    if (/[\\/]|\.\./.test(mod.file) || !mod.file.endsWith('.jar')) {
      throw new Error(`Bad file name in manifest: ${mod.file}`)
    }
  }
  for (const p of [...(x.resourcepacks ?? []), ...(x.shaderpacks ?? [])]) {
    if (!p.file || !p.id || !/^[0-9a-f]{40}$/.test(p.sha1) || !p.downloads?.length) {
      throw new Error(`Manifest entry for pack ${p.id ?? '?'} is incomplete`)
    }
    // Same rule as mods: a pack must stay inside its folder.
    if (/[\\/]|\.\./.test(p.file) || !p.file.toLowerCase().endsWith('.zip')) {
      throw new Error(`Bad pack file name in manifest: ${p.file}`)
    }
  }
  return x
}

/**
 * Downloads the current pack manifest, falling back to mirrors and then to the last
 * copy that worked (so the game still starts if GitHub is unreachable).
 * VF_MANIFEST_FILE points at a local manifest for development.
 */
export async function fetchManifest(): Promise<PackManifest> {
  const local = process.env.VF_MANIFEST_FILE
  if (local) return validate(JSON.parse(await readFile(local, 'utf8')))

  const errors: string[] = []
  for (const url of MANIFEST_URLS) {
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(15000)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const manifest = validate(await res.json())
      await mkdir(dirname(paths.manifestCache), { recursive: true })
      await writeFile(paths.manifestCache, JSON.stringify(manifest))
      return manifest
    } catch (e) {
      errors.push(`${new URL(url).host}: ${(e as Error).message}`)
    }
  }
  try {
    return validate(JSON.parse(await readFile(paths.manifestCache, 'utf8')))
  } catch {
    throw new Error(`Could not download the modpack list (${errors.join('; ')})`)
  }
}

/** Mods that should be in the mods folder for these settings. */
export function selectMods(manifest: PackManifest, settings: Settings): ModEntry[] {
  const enabled = resolveOptional(manifest, settings.optionalMods)
  return manifest.mods.filter((m) => !m.optional || enabled[m.id])
}

/**
 * Applies defaults and dependencies between optional mods: a mod whose required
 * optional mod is off gets turned off too.
 */
export function resolveOptional(
  manifest: PackManifest,
  choices: Record<string, boolean>
): Record<string, boolean> {
  const state: Record<string, boolean> = {}
  for (const m of manifest.mods) if (m.optional) state[m.id] = choices[m.id] ?? m.default
  let changed = true
  while (changed) {
    changed = false
    for (const m of manifest.mods) {
      if (m.optional && state[m.id] && m.requires.some((r) => state[r] === false)) {
        state[m.id] = false
        changed = true
      }
    }
  }
  return state
}
