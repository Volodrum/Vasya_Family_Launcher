#!/usr/bin/env node
/**
 * Builds pack/manifest.json from the jars in pack/mods.
 *
 *   npm run pack:build                 # resolve sources, write manifest
 *   npm run pack:build -- --upload     # also upload non-Modrinth jars to the GitHub release (needs `gh`)
 *   npm run pack:build -- --mods <dir> # read jars from another folder
 *
 * Every mod gets a list of download URLs. Modrinth is used when the exact file (by SHA-1)
 * is published there; anything else is served from the GitHub release in pack.config.json.
 * Extra mirrors (CurseForge, your own site, ...) can be added per mod via
 * overrides.<modId>.extraDownloads (added as fallbacks) or overrides.<modId>.downloads
 * (replaces the automatic lookup), so the launcher is never tied to a single source.
 * The launcher always checks SHA-1 after downloading, whatever the source.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, statSync, copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import AdmZip from 'adm-zip'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}

const config = JSON.parse(readFileSync(join(root, 'pack', 'pack.config.json'), 'utf8'))
const modsDir = resolve(opt('--mods', join(root, 'pack', 'mods')))
const outFile = join(root, 'pack', 'manifest.json')
const overrides = config.overrides ?? {}
const UA = 'vasya-family-launcher-pack-tool/1.0'

function parseModJson(raw) {
  // Some mods ship fabric.mod.json with raw control characters inside strings.
  return JSON.parse(raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' '))
}

/** Collects every mod id a jar provides, including jar-in-jar libraries. */
function collectProvided(zip, into) {
  const entry = zip.getEntry('fabric.mod.json')
  if (entry) {
    try {
      const meta = parseModJson(entry.getData().toString('utf8'))
      into.add(meta.id)
      for (const p of meta.provides ?? []) into.add(p)
    } catch {
      /* ignore broken nested metadata */
    }
  }
  for (const e of zip.getEntries()) {
    if (e.entryName.startsWith('META-INF/jars/') && e.entryName.endsWith('.jar')) {
      try {
        collectProvided(new AdmZip(e.getData()), into)
      } catch {
        /* ignore */
      }
    }
  }
}

function readJar(file) {
  const buf = readFileSync(file)
  const zip = new AdmZip(buf)
  const entry = zip.getEntry('fabric.mod.json')
  if (!entry) throw new Error(`${file} is not a Fabric mod (no fabric.mod.json)`)
  const meta = parseModJson(entry.getData().toString('utf8'))
  const provided = new Set()
  collectProvided(zip, provided)
  return {
    buf,
    meta,
    provided,
    sha1: createHash('sha1').update(buf).digest('hex'),
    sha512: createHash('sha512').update(buf).digest('hex'),
    size: buf.length
  }
}

async function lookupModrinth(sha1s) {
  const res = await fetch('https://api.modrinth.com/v2/version_files', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ hashes: sha1s, algorithm: 'sha1' })
  })
  if (!res.ok) throw new Error(`Modrinth lookup failed: HTTP ${res.status}`)
  return res.json()
}

const jars = readdirSync(modsDir).filter((f) => f.endsWith('.jar')).sort((a, b) => a.localeCompare(b))
if (jars.length === 0) throw new Error(`No jars in ${modsDir}`)

console.log(`Reading ${jars.length} jars from ${modsDir}`)
const mods = jars.map((file) => ({ file, ...readJar(join(modsDir, file)) }))

console.log('Looking up files on Modrinth...')
const found = await lookupModrinth(mods.map((m) => m.sha1))

const selfBase = `https://github.com/${config.selfHost.repo}/releases/download/${config.selfHost.tag}/`
const toUpload = []

const entries = mods.map((m) => {
  const id = m.meta.id
  const ov = overrides[id] ?? {}
  const downloads = []
  let source
  const mr = found[m.sha1]
  const mrFile = mr?.files?.find((f) => f.hashes?.sha1 === m.sha1)
  if (ov.downloads?.length) {
    // Manually pinned sources (e.g. a CurseForge CDN link) replace the automatic lookup.
    downloads.push(...ov.downloads)
    source = { type: 'url' }
  } else if (mrFile) {
    downloads.push(mrFile.url)
    source = { type: 'modrinth', projectId: mr.project_id, versionId: mr.id }
  } else {
    downloads.push(selfBase + `${m.sha1}.jar`)
    source = { type: 'github-release', asset: `${m.sha1}.jar` }
    toUpload.push(m)
  }
  for (const url of ov.extraDownloads ?? []) downloads.push(url)

  const env = m.meta.environment ?? '*'
  const optional = ov.optional ?? env === 'client'
  return {
    id,
    name: ov.name ?? m.meta.name ?? id,
    version: String(m.meta.version ?? ''),
    // Some downloads keep URL escapes in the name (fabric-api-0.92.12%2B1.20.1.jar).
    file: m.file.replace(/%2B/gi, '+'),
    size: m.size,
    sha1: m.sha1,
    sha512: m.sha512,
    side: env === 'client' ? 'client' : env === 'server' ? 'server' : 'both',
    optional,
    default: optional ? (ov.default ?? true) : true,
    requires: [],
    downloads,
    source,
    _src: m.file,
    _depends: Object.keys(m.meta.depends ?? {}),
    _provided: m.provided
  }
})

// Optional mods that depend on other optional mods: the launcher keeps them consistent
// (turning Sodium off also turns Iris off, and the other way round).
for (const e of entries) {
  if (!e.optional) continue
  for (const dep of e._depends) {
    const provider = entries.find((o) => o !== e && o._provided.has(dep))
    if (provider?.optional && !e.requires.includes(provider.id)) e.requires.push(provider.id)
  }
}

const serverOnly = entries.filter((e) => e.side === 'server')
if (serverOnly.length) {
  console.warn(`Skipping server-only mods (they belong on the server, not in the client pack): ${serverOnly.map((e) => e.file).join(', ')}`)
}

const now = new Date()
const manifest = {
  schema: 1,
  name: config.name,
  packVersion: now.toISOString().replace(/[-:]/g, '').replace(/\..+/, ''),
  generatedAt: now.toISOString(),
  minecraft: config.minecraft,
  loader: config.loader,
  java: config.java,
  servers: config.servers,
  policy: config.policy,
  mods: entries
    .filter((e) => e.side !== 'server')
    .map(({ _depends, _provided, _src, ...rest }) => rest)
}

writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n')
const optional = manifest.mods.filter((m) => m.optional)
console.log(`Wrote ${outFile}`)
console.log(`  ${manifest.mods.length} mods, ${optional.length} optional: ${optional.map((m) => m.name + (m.requires.length ? ` (needs ${m.requires.join(', ')})` : '')).join('; ')}`)
const bySource = {}
for (const m of manifest.mods) bySource[m.source.type] = (bySource[m.source.type] ?? 0) + 1
console.log(`  sources: ${Object.entries(bySource).map(([k, v]) => `${v} ${k}`).join(', ')}`)
if (toUpload.length) console.log(`  waiting for upload to the GitHub release: ${toUpload.map((m) => m.file).join(', ')}`)

if (toUpload.length && flag('--upload')) {
  const { repo, tag } = config.selfHost
  try {
    execFileSync('gh', ['release', 'view', tag, '--repo', repo], { stdio: 'ignore' })
  } catch {
    console.log(`Creating release ${tag} on ${repo}`)
    // Marked as a pre-release so the launcher's auto-updater (which follows the latest
    // full release) never mistakes it for a launcher version.
    execFileSync(
      'gh',
      ['release', 'create', tag, '--repo', repo, '--prerelease', '--latest=false', '--title', 'Pack files', '--notes', 'Mod files that are not on Modrinth. Managed by tools/build-manifest.mjs.'],
      { stdio: 'inherit' }
    )
  }
  const staging = join(tmpdir(), `vf-upload-${Date.now()}`)
  mkdirSync(staging, { recursive: true })
  const paths = toUpload.map((m) => {
    const p = join(staging, `${m.sha1}.jar`)
    copyFileSync(join(modsDir, m.file), p)
    return p
  })
  execFileSync('gh', ['release', 'upload', tag, ...paths, '--repo', repo, '--clobber'], { stdio: 'inherit' })
  rmSync(staging, { recursive: true, force: true })
  console.log(`Uploaded ${paths.length} file(s) to ${repo}@${tag}`)
} else if (toUpload.length) {
  console.log('Run again with --upload to publish the self-hosted files to the GitHub release.')
}

// Sanity check: everything listed must still exist and match.
for (const e of entries) {
  if (statSync(join(modsDir, e._src)).size !== e.size) throw new Error(`Size changed while building: ${e._src}`)
}
