import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PackFileEntry, PackManifest } from '../shared/types'
import { downloadMod, isValid } from './mods'

/**
 * Resource packs and shader packs that come with the modpack.
 *
 * Unlike mods, these folders are shared with the player: their own packs are never touched.
 * The launcher only adds the pack's files, replaces them when the pack updates, and removes
 * files it installed itself that the pack no longer lists. Pack defaults (which resource
 * packs are switched on, which shader is selected) are applied once, the first time a pack
 * appears, so later choices made in the game are respected.
 */

interface PackState {
  /** pack id -> file the launcher installed for it */
  resourcepacks: Record<string, string>
  shaderpacks: Record<string, string>
  /** Resource pack ids whose "on by default" was already applied. */
  introduced: string[]
  /** True once the first-run shader choice was written. */
  shadersIntroduced: boolean
}

const empty = (): PackState => ({ resourcepacks: {}, shaderpacks: {}, introduced: [], shadersIntroduced: false })

async function readState(file: string): Promise<PackState> {
  try {
    return { ...empty(), ...JSON.parse(await readFile(file, 'utf8')) }
  } catch {
    return empty()
  }
}

async function readLines(file: string): Promise<string[] | null> {
  try {
    return (await readFile(file, 'utf8')).split(/\r?\n/)
  } catch {
    return null
  }
}

/** Minecraft stores the pack list as a JSON array on one line of options.txt. */
function parseList(lines: string[], key: string): string[] | null {
  const line = lines.find((l) => l.startsWith(`${key}:`))
  if (!line) return null
  try {
    const v = JSON.parse(line.slice(key.length + 1))
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : null
  } catch {
    return null
  }
}

function setList(lines: string[], key: string, list: string[]): string[] {
  const text = `${key}:${JSON.stringify(list)}`
  const i = lines.findIndex((l) => l.startsWith(`${key}:`))
  if (i >= 0) lines[i] = text
  else lines.splice(lines.length && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length, 0, text)
  return lines
}

/** Downloads missing or changed pack files; returns names of packs that failed (not fatal). */
async function syncFolder(
  dir: string,
  wanted: PackFileEntry[],
  previous: Record<string, string>,
  onFile: (name: string) => void
): Promise<{ installed: Record<string, string>; failed: string[]; renamed: Array<[string, string]> }> {
  await mkdir(dir, { recursive: true })
  const installed: Record<string, string> = {}
  const failed: string[] = []
  const renamed: Array<[string, string]> = []
  const wantedFiles = new Set(wanted.map((p) => p.file.toLowerCase()))

  for (const p of wanted) {
    const dest = join(dir, p.file)
    if (!(await isValid(dest, p))) {
      onFile(p.name)
      try {
        await downloadMod(p, dest, () => {})
      } catch {
        failed.push(p.name)
        if (previous[p.id]) installed[p.id] = previous[p.id]
        continue
      }
    }
    installed[p.id] = p.file
    const old = previous[p.id]
    if (old && old !== p.file) renamed.push([old, p.file])
  }
  // Remove files this launcher installed earlier that the pack no longer lists.
  for (const [id, file] of Object.entries(previous)) {
    if (installed[id] === file || wantedFiles.has(file.toLowerCase())) continue
    await rm(join(dir, file), { force: true })
  }
  return { installed, failed, renamed }
}

export async function syncPacks(
  manifest: PackManifest,
  instanceDir: string,
  stateFile: string,
  onProgress: (fraction: number, detail: string) => void
): Promise<{ failed: string[] }> {
  const rps = manifest.resourcepacks ?? []
  const sps = manifest.shaderpacks ?? []
  const state = await readState(stateFile)
  const total = rps.length + sps.length
  let done = 0
  const step = (name: string): void => onProgress(total ? done++ / total : 1, name)

  const rp = await syncFolder(join(instanceDir, 'resourcepacks'), rps, state.resourcepacks, step)
  const sp = await syncFolder(join(instanceDir, 'shaderpacks'), sps, state.shaderpacks, step)

  // ---- resource packs: keep options.txt pointing at renamed files, switch on new default packs once
  const optionsFile = join(instanceDir, 'options.txt')
  // A brand-new instance has no options.txt yet; 3465 is the 1.20.1 data version, so Minecraft reads it as current.
  let lines = (await readLines(optionsFile)) ?? ['version:3465']
  const before = lines.join('\n')
  let selected = parseList(lines, 'resourcePacks') ?? ['vanilla']
  let incompatible = parseList(lines, 'incompatibleResourcePacks') ?? []
  for (const [oldFile, newFile] of rp.renamed) {
    selected = selected.map((s) => (s === `file/${oldFile}` ? `file/${newFile}` : s))
    incompatible = incompatible.filter((s) => s !== `file/${oldFile}`)
  }
  for (const p of rps) {
    if (state.introduced.includes(p.id) || !rp.installed[p.id]) continue
    state.introduced.push(p.id)
    const entry = `file/${p.file}`
    if (p.enabled && !selected.includes(entry)) selected.push(entry)
  }
  lines = setList(lines, 'resourcePacks', selected)
  if (incompatible.length || parseList(lines, 'incompatibleResourcePacks')) lines = setList(lines, 'incompatibleResourcePacks', incompatible)
  if (lines.join('\n') !== before) await writeFile(optionsFile, lines.join('\n').replace(/\n?$/, '\n'))

  // ---- shaders: follow renames, and write the first-run choice once (unless the player already picked one)
  const irisFile = join(instanceDir, 'config', 'iris.properties')
  let iris = await readLines(irisFile)
  const irisBefore = iris?.join('\n')
  if (iris) {
    for (const [oldFile, newFile] of sp.renamed) iris = iris.map((l) => (l === `shaderPack=${oldFile}` ? `shaderPack=${newFile}` : l))
  }
  const def = manifest.shaders?.default
  if (!state.shadersIntroduced && def && sp.installed[sps.find((s) => s.file === def)?.id ?? '']) {
    state.shadersIntroduced = true
    const chosen = iris?.some((l) => /^shaderPack=.+/.test(l))
    if (!chosen) {
      iris = (iris ?? ['# Written by the Vasya Family launcher on first start']).filter((l) => !/^(shaderPack|enableShaders)=/.test(l))
      iris.push(`shaderPack=${def}`, `enableShaders=${manifest.shaders?.enabled ? 'true' : 'false'}`)
    }
  }
  if (iris && iris.join('\n') !== irisBefore) {
    await mkdir(dirname(irisFile), { recursive: true })
    await writeFile(irisFile, iris.join('\n').replace(/\n?$/, '\n'))
  }

  state.resourcepacks = rp.installed
  state.shaderpacks = sp.installed
  await mkdir(dirname(stateFile), { recursive: true })
  await writeFile(stateFile, JSON.stringify(state, null, 2))
  onProgress(1, '')
  return { failed: [...rp.failed, ...sp.failed] }
}
