import { nativeImage } from 'electron'
import type { Dirent } from 'node:fs'
import { lstat, mkdir, readdir, readFile, readlink, rename, rm, rmdir, stat, symlink, unlink, utimes, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/**
 * Keeps one JourneyMap map per server world, whatever way the player joined.
 *
 * JourneyMap stores a server's map in journeymap/data/mp/<server name>_<world id>. The world id
 * comes from the JourneyMap server mod and never changes, but the name is the name of the entry
 * the game joined through (net.minecraft ServerData.name, with every run of non-word characters
 * turned into "~"), and that changes:
 *   - quick play (launcher 1.0–1.1) names it after the game's "Minecraft Server" text, which also
 *     changes with the game language;
 *   - the FancyMenu join button (launcher 1.2+) names it after the address, so picking another
 *     connection (SRV / anycast / direct) changes it again.
 * Each change starts an empty map. Waypoints still show because the server keeps them, which is
 * why the map looked "reset, only waypoints left".
 *
 * Before each launch, folders that share a world id are merged into one real folder, and every
 * other name (plus the name of each connection the launcher offers) becomes a directory junction
 * to it, so JourneyMap writes to the same map under any name. Map tiles that exist in both are
 * layered: newer pixels on top, older ones fill the gaps. Files that cannot be layered keep the
 * better copy; the other copy goes to journeymap/merged-backup, never deleted.
 */

const WORLD_ID = /_([0-9a-f]{8}~[0-9a-f]{4}~[0-9a-f]{4}~[0-9a-f]{4}~[0-9a-f]{12})$/i

/** The folder name JourneyMap uses for a server entry whose name is `name`. */
export function journeyMapName(name: string): string {
  return name.replace(/\W+/g, '~').trim()
}

interface Entry {
  name: string
  path: string
  /** Where the entry points when it is a junction; null for a real folder. */
  to: string | null
}

export interface JourneyMapResult {
  merged: string[]
  linked: string[]
}

export async function unifyJourneyMapWorlds(instanceDir: string, addresses: string[]): Promise<JourneyMapResult> {
  const result: JourneyMapResult = { merged: [], linked: [] }
  const mpDir = join(instanceDir, 'journeymap', 'data', 'mp')
  let entries: Dirent[]
  try {
    entries = await readdir(mpDir, { withFileTypes: true })
  } catch {
    return result // JourneyMap has not mapped a server yet
  }

  const worlds = new Map<string, Entry[]>()
  for (const e of entries) {
    const id = WORLD_ID.exec(e.name)?.[1]?.toLowerCase()
    if (!id || !(e.isDirectory() || e.isSymbolicLink())) continue
    const path = join(mpDir, e.name)
    const to = (await lstat(path)).isSymbolicLink() ? await readlink(path) : null
    worlds.set(id, [...(worlds.get(id) ?? []), { name: e.name, path, to }])
  }

  const backupRoot = join(instanceDir, 'journeymap', 'merged-backup', new Date().toISOString().replace(/[:.]/g, '-'))
  for (const [, group] of worlds) {
    const real = group.filter((e) => e.to === null)
    if (!real.length) continue
    const target = await pickTarget(group, real)

    for (const src of real) {
      if (src === target) continue
      await mergeDir(src.path, target.path, join(backupRoot, src.name))
      await removeIfEmpty(src.path)
      // Anything left could not be merged without losing data: keep it aside.
      if (await exists(src.path)) {
        await mkdir(backupRoot, { recursive: true })
        await rename(src.path, join(backupRoot, `${src.name}-rest`))
      }
      result.merged.push(src.name)
    }

    // Every name this world has had, plus the name each launcher connection would give it.
    const suffix = target.name.slice(WORLD_ID.exec(target.name)!.index)
    const names = new Set(group.map((e) => e.name))
    for (const address of addresses) names.add(journeyMapName(address) + suffix)
    for (const name of names) {
      if (name === target.name) continue
      const path = join(mpDir, name)
      if (await pointsTo(path, target.path)) continue
      await removeLink(path)
      await symlink(target.path, path, 'junction')
      result.linked.push(name)
    }
  }
  return result
}

/** The folder the others merge into: the one existing links already use, else the biggest map. */
async function pickTarget(group: Entry[], real: Entry[]): Promise<Entry> {
  for (const e of group) {
    const found = e.to !== null && real.find((r) => sameDir(e.to!, r.path))
    if (found) return found
  }
  let best = real[0]
  let bestCount = -1
  for (const e of real) {
    const count = await countFiles(e.path)
    if (count > bestCount) [best, bestCount] = [e, count]
  }
  return best
}

async function mergeDir(src: string, dst: string, backup: string): Promise<void> {
  await mkdir(dst, { recursive: true })
  for (const e of await readdir(src, { withFileTypes: true })) {
    const s = join(src, e.name)
    const d = join(dst, e.name)
    if (!(await exists(d))) {
      await rename(s, d)
    } else if (e.isDirectory()) {
      await mergeDir(s, d, join(backup, e.name))
      await removeIfEmpty(s)
    } else if (e.isFile()) {
      await mergeFile(s, d, join(backup, e.name))
    }
  }
}

async function mergeFile(src: string, dst: string, backup: string): Promise<void> {
  const [s, d] = await Promise.all([stat(src), stat(dst)])
  if (src.toLowerCase().endsWith('.png') && (await layerTiles(src, dst, s.mtimeMs > d.mtimeMs))) {
    await rm(src, { force: true })
    return
  }
  // Region chunk caches (*.jmc) cannot be combined: keep the one holding more chunks.
  // Anything else: keep the newer copy.
  const srcWins = src.toLowerCase().endsWith('.jmc') ? s.size > d.size : s.mtimeMs > d.mtimeMs
  await mkdir(join(backup, '..'), { recursive: true })
  if (srcWins) {
    await rename(dst, backup)
    await rename(src, dst)
  } else {
    await rename(src, backup)
  }
}

/** Writes the two tiles layered into `dst`: the newer tile's pixels over the older one's. */
async function layerTiles(src: string, dst: string, srcIsNewer: boolean): Promise<boolean> {
  const [a, b] = await Promise.all([readFile(src), readFile(dst)])
  const [newer, older] = srcIsNewer ? [a, b] : [b, a]
  const top = nativeImage.createFromBuffer(newer)
  const bottom = nativeImage.createFromBuffer(older)
  if (top.isEmpty() || bottom.isEmpty()) return false
  const size = top.getSize()
  const other = bottom.getSize()
  if (size.width !== other.width || size.height !== other.height) return false

  const out = Buffer.from(bottom.toBitmap())
  const over = top.toBitmap()
  // Same pixel layout in both bitmaps (BGRA or RGBA, 4 bytes); alpha is always the last byte.
  for (let i = 0; i < over.length; i += 4) {
    if (over[i + 3] !== 0) over.copy(out, i, i, i + 4)
  }
  const times = await Promise.all([stat(src), stat(dst)])
  await writeFile(dst, nativeImage.createFromBitmap(out, size).toPNG())
  const newest = new Date(Math.max(times[0].mtimeMs, times[1].mtimeMs))
  await utimes(dst, newest, newest)
  return true
}

async function pointsTo(path: string, target: string): Promise<boolean> {
  try {
    if (!(await lstat(path)).isSymbolicLink()) return false
    return sameDir(await readlink(path), target)
  } catch {
    return false
  }
}

function sameDir(a: string, b: string): boolean {
  const norm = (p: string) => resolve(p.replace(/^\\\\\?\\/, '')).replace(/[\\/]+$/, '').toLowerCase()
  return !!a && norm(a) === norm(b)
}

/** Removes a junction (never the folder it points to). Leaves real folders alone. */
async function removeLink(path: string): Promise<void> {
  let info
  try {
    info = await lstat(path)
  } catch {
    return
  }
  if (!info.isSymbolicLink()) throw new Error(`${path} is a real folder, not a link`)
  try {
    await unlink(path)
  } catch {
    await rmdir(path)
  }
}

async function removeIfEmpty(dir: string): Promise<void> {
  try {
    if (!(await readdir(dir)).length) await rmdir(dir)
  } catch {
    /* already gone */
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch {
    return false
  }
}

async function countFiles(dir: string): Promise<number> {
  let n = 0
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += await countFiles(join(dir, e.name))
    else n++
  }
  return n
}
