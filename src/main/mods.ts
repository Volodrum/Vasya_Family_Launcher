import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ModEntry } from '../shared/types'
import { USER_AGENT } from './paths'

export function sha1File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

/** Anything the launcher downloads and verifies: mods, resource packs, shader packs. */
export type Downloadable = Pick<ModEntry, 'name' | 'sha1' | 'size' | 'downloads'>

export async function isValid(file: string, mod: Downloadable): Promise<boolean> {
  try {
    const s = await stat(file)
    if (!s.isFile() || s.size !== mod.size) return false
    return (await sha1File(file)) === mod.sha1
  } catch {
    return false
  }
}

/** Tries each URL in turn; only a file with the expected SHA-1 is accepted. */
export async function downloadMod(mod: Downloadable, dest: string, onBytes: (n: number) => void): Promise<void> {
  const errors: string[] = []
  for (const url of mod.downloads) {
    let received = 0
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(120000) })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const chunks: Buffer[] = []
      const hash = createHash('sha1')
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        const b = Buffer.from(chunk)
        chunks.push(b)
        hash.update(b)
        received += b.length
        onBytes(b.length)
      }
      const digest = hash.digest('hex')
      if (digest !== mod.sha1) throw new Error(`checksum mismatch (${digest.slice(0, 8)})`)
      const tmp = `${dest}.part`
      await writeFile(tmp, Buffer.concat(chunks))
      await rename(tmp, dest)
      return
    } catch (e) {
      onBytes(-received)
      errors.push(`${new URL(url).host}: ${(e as Error).message}`)
    }
  }
  throw new Error(`Could not download ${mod.name}: ${errors.join('; ')}`)
}

async function listJars(dir: string, base = dir): Promise<string[]> {
  const out: string[] = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await listJars(full, base)))
    else out.push(full)
  }
  return out
}

export interface SyncResult {
  downloaded: string[]
  removed: string[]
  /** Optional mods that could not be downloaded; the game starts without them. */
  skipped: string[]
}

/**
 * Makes the mods folder match the pack exactly: downloads missing or modified mods
 * and deletes everything else (extra jars, disabled optional mods, leftovers).
 */
export async function syncMods(
  modsDir: string,
  wanted: ModEntry[],
  onProgress: (fraction: number, detail: string) => void
): Promise<SyncResult> {
  await mkdir(modsDir, { recursive: true })
  const wantedByFile = new Map(wanted.map((m) => [m.file.toLowerCase(), m]))
  const removed: string[] = []

  for (const file of await listJars(modsDir)) {
    const rel = file.slice(modsDir.length + 1)
    const isTopLevel = !rel.includes('\\') && !rel.includes('/')
    if (!isTopLevel || !wantedByFile.has(rel.toLowerCase())) {
      await rm(file, { force: true })
      removed.push(rel)
    }
  }
  // Remove now-empty subfolders; Fabric only loads the top level anyway.
  for (const e of await readdir(modsDir, { withFileTypes: true })) {
    if (e.isDirectory()) await rm(join(modsDir, e.name), { recursive: true, force: true })
  }

  onProgress(-1, 'verify')
  const missing: ModEntry[] = []
  for (const mod of wanted) {
    if (!(await isValid(join(modsDir, mod.file), mod))) missing.push(mod)
  }

  const total = missing.reduce((n, m) => n + m.size, 0)
  let done = 0
  const queue = [...missing]
  const skipped: string[] = []
  const worker = async (): Promise<void> => {
    for (let mod = queue.shift(); mod; mod = queue.shift()) {
      onProgress(total ? done / total : 0, mod.name)
      try {
        await downloadMod(mod, join(modsDir, mod.file), (n) => {
          done += n
          onProgress(total ? done / total : 0, mod.name)
        })
      } catch (e) {
        // A client-only optional mod is not worth blocking the game for.
        if (!mod.optional) throw e
        skipped.push(mod.name)
        done += mod.size
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, missing.length) }, worker))
  onProgress(1, '')
  return { downloaded: missing.filter((m) => !skipped.includes(m.name)).map((m) => m.file), removed, skipped }
}
