import { createHash, createHmac } from 'node:crypto'

/**
 * Launch proof for the Vasya Family Guard mod (guard-mod/), which lets only games started by this
 * launcher join the server.
 *
 * The shared secret is baked in at build time from VF_GUARD_SECRET or the file guard.secret (see
 * electron.vite.config.ts); it is never committed. The game only receives a key derived from it for
 * this nickname, launch time and mod set, so the secret itself is not passed to Java.
 *
 * Honest limits: anyone can unpack the launcher and find the secret. This keeps out people who skip the
 * launcher casually (TLauncher with their own mods, an outdated pack), not a determined cheater.
 */
declare const __VF_GUARD_SECRET__: string

/** Must match GuardProtocol.PROPERTY in the mod. */
const PROPERTY = 'vasyafamily.guard'

export function guardEnabled(): boolean {
  return __VF_GUARD_SECRET__.length > 0
}

/** SHA-256 of the sorted, de-duplicated SHA-1s joined with '\n'. Same as GuardProtocol.modsHash. */
export function modsHash(sha1s: string[]): string {
  const sorted = [...new Set(sha1s.map((s) => s.toLowerCase()))].sort()
  return createHash('sha256').update(sorted.join('\n'), 'utf8').digest('hex')
}

/** Same as GuardProtocol.sessionKey. */
export function sessionKey(secret: string, nickname: string, launchTime: number, hash: string): string {
  return createHmac('sha256', Buffer.from(secret, 'utf8')).update(`vfguard1|${nickname}|${launchTime}|${hash}`, 'utf8').digest('hex')
}

/**
 * JVM arguments that let the game prove it was started by this launcher with exactly these mod jars.
 * Empty when the build has no secret (development builds), so the game still starts but a server with
 * the guard turned on will refuse it.
 */
export function guardJvmArgs(nickname: string, modSha1s: string[], now = Date.now()): string[] {
  if (!guardEnabled()) return []
  const launchTime = Math.floor(now / 1000)
  const hash = modsHash(modSha1s)
  return [`-D${PROPERTY}=v1:${launchTime}:${hash}:${sessionKey(__VF_GUARD_SECRET__, nickname, launchTime, hash)}`]
}
