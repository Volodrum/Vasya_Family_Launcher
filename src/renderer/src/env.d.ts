import type { LauncherApi } from '../../shared/types'

declare global {
  interface Window {
    vf: LauncherApi
  }
}

export {}
