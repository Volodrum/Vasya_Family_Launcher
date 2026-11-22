import { execFile } from 'node:child_process'
import { readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { paths } from './paths'

/**
 * The game is started detached, so it keeps running after the launcher quits. This file remembers it,
 * so a launcher opened again still knows the game is on: Play, nickname and mod sync stay locked
 * until that game closes (otherwise a second game could start next to the first one).
 */
interface RunningGame {
  pid: number
  startedAt: number
}

const file = (): string => join(paths.state, 'game.json')

export async function rememberGame(pid: number): Promise<void> {
  await mkdir(dirname(file()), { recursive: true })
  await writeFile(file(), JSON.stringify({ pid, startedAt: Date.now() } satisfies RunningGame))
}

export async function forgetGame(): Promise<void> {
  await rm(file(), { force: true })
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    // ESRCH: gone. EPERM: the process exists but belongs to someone else, which is not our game.
    return false
  }
}

/** True when the process is a Java started for our game folder (guards against a reused PID). */
function isOurGame(pid: number): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(true)
  const script = `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
      if (err) return resolve(true) // can't tell: trust the PID rather than risk a second game
      const cmd = stdout.toLowerCase()
      resolve(cmd.includes('java') && cmd.includes(paths.instance.toLowerCase()))
    })
  })
}

/** PID of a game this launcher started earlier that is still running, or null. */
export async function findRunningGame(): Promise<number | null> {
  let saved: RunningGame
  try {
    saved = JSON.parse(await readFile(file(), 'utf8')) as RunningGame
  } catch {
    return null
  }
  if (typeof saved.pid === 'number' && alive(saved.pid) && (await isOurGame(saved.pid))) return saved.pid
  await forgetGame()
  return null
}

/** Calls onExit once the process is gone. */
export function watchExit(pid: number, onExit: () => void): void {
  const timer = setInterval(() => {
    if (alive(pid)) return
    clearInterval(timer)
    onExit()
  }, 2000)
}
