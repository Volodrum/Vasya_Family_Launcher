import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * Shared secret for the Vasya Family Guard server mod (see src/main/guard.ts and guard-mod/).
 * Taken from the VF_GUARD_SECRET environment variable, or from the file guard.secret next to
 * package.json (git-ignored). It must equal `secret` in the server's config/vasyafamily-guard.properties.
 */
function guardSecret(): string {
  const env = process.env.VF_GUARD_SECRET
  if (env !== undefined) return env.trim()
  const file = resolve(process.cwd(), 'guard.secret')
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : ''
}

const secret = guardSecret()
if (!secret) {
  console.warn('[guard] No VF_GUARD_SECRET / guard.secret: this build cannot join a server that has Vasya Family Guard turned on.')
}

export default defineConfig({
  main: {
    define: { __VF_GUARD_SECRET__: JSON.stringify(secret) }
  },
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
