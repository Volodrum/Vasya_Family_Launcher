import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { SkinInfo } from '../shared/types'
import { NICKNAME_RE } from '../shared/types'
import { USER_AGENT, paths } from './paths'

/**
 * Looks up the skin for a nickname the same way the server's SkinRestorer auto-fetch does:
 * the licensed (Mojang) account with that name first, then Ely.by. No login needed.
 * Results are cached for a day so the launcher works offline and doesn't hammer the APIs.
 */

const CACHE_MS = 24 * 60 * 60 * 1000
const MAX_PNG = 256 * 1024

interface Found {
  url: string
  slim: boolean
  source: SkinInfo['source']
}

async function getJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8000) })
  if (res.status === 204 || res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fromMojang(name: string): Promise<Found | null> {
  const profile = (await getJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`)) as { id?: string } | null
  if (!profile?.id) return null
  const session = (await getJson(`https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`)) as {
    properties?: { name: string; value: string }[]
  } | null
  const prop = session?.properties?.find((p) => p.name === 'textures')
  if (!prop) return null
  const textures = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8')) as {
    textures?: { SKIN?: { url: string; metadata?: { model?: string } } }
  }
  const skin = textures.textures?.SKIN
  return skin?.url ? { url: skin.url, slim: skin.metadata?.model === 'slim', source: 'mojang' } : null
}

async function fromEly(name: string): Promise<Found | null> {
  const data = (await getJson(`http://skinsystem.ely.by/textures/${encodeURIComponent(name)}`)) as {
    SKIN?: { url: string; metadata?: { model?: string } }
  } | null
  return data?.SKIN?.url ? { url: data.SKIN.url, slim: data.SKIN.metadata?.model === 'slim', source: 'ely.by' } : null
}

async function download(url: string): Promise<Buffer> {
  // Skins are served over plain http by both services; ask for https where it is available.
  const u = url.replace(/^http:\/\/textures\.minecraft\.net\//, 'https://textures.minecraft.net/')
  const res = await fetch(u, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  // Only accept a real PNG of sensible size.
  if (buf.length > MAX_PNG || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a skin image')
  return buf
}

const inFlight = new Map<string, Promise<SkinInfo | null>>()

export function getSkin(name: string): Promise<SkinInfo | null> {
  if (!NICKNAME_RE.test(name)) return Promise.resolve(null)
  const key = name.toLowerCase()
  let p = inFlight.get(key)
  if (!p) {
    p = lookup(name).finally(() => inFlight.delete(key))
    inFlight.set(key, p)
  }
  return p
}

async function lookup(name: string): Promise<SkinInfo | null> {
  const dir = join(paths.state, 'skins')
  const key = name.toLowerCase()
  const metaFile = join(dir, `${key}.json`)
  const pngFile = join(dir, `${key}.png`)

  const cached = async (): Promise<SkinInfo | null> => {
    try {
      const meta = JSON.parse(await readFile(metaFile, 'utf8')) as { found: Found | null }
      if (!meta.found) return null
      const png = await readFile(pngFile)
      return { png: `data:image/png;base64,${png.toString('base64')}`, slim: meta.found.slim, source: meta.found.source }
    } catch {
      return null
    }
  }

  try {
    if (Date.now() - (await stat(metaFile)).mtimeMs < CACHE_MS) return await cached()
  } catch {
    /* no cache yet */
  }

  try {
    let found: Found | null = null
    for (const source of [fromMojang, fromEly]) {
      try {
        found = await source(name)
      } catch {
        found = null
      }
      if (found) break
    }
    await mkdir(dir, { recursive: true })
    if (found) await writeFile(pngFile, await download(found.url))
    await writeFile(metaFile, JSON.stringify({ found, checkedAt: new Date().toISOString() }))
    return await cached()
  } catch {
    // Offline or an API is down: fall back to whatever we had.
    return cached()
  }
}
