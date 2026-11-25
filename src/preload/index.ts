import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { GameEvent, LauncherApi, NoticeEvent, ProgressEvent, UpdateEvent } from '../shared/types'

function listen<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: LauncherApi = {
  getState: () => ipcRenderer.invoke('vf:getState'),
  getSkin: (nickname) => ipcRenderer.invoke('vf:getSkin', nickname),
  saveSettings: (patch) => ipcRenderer.invoke('vf:saveSettings', patch),
  refreshManifest: () => ipcRenderer.invoke('vf:refreshManifest'),
  play: (mode) => ipcRenderer.invoke('vf:play', mode),
  repair: () => ipcRenderer.invoke('vf:repair'),
  openFolder: (which) => ipcRenderer.invoke('vf:openFolder', which),
  installUpdate: () => ipcRenderer.invoke('vf:installUpdate'),
  minimize: () => ipcRenderer.send('vf:minimize'),
  close: () => ipcRenderer.send('vf:close'),
  onProgress: (cb) => listen<ProgressEvent>('vf:progress', cb),
  onGame: (cb) => listen<GameEvent>('vf:game', cb),
  onUpdate: (cb) => listen<UpdateEvent>('vf:update', cb),
  onNotice: (cb) => listen<NoticeEvent>('vf:notice', cb)
}

contextBridge.exposeInMainWorld('vf', api)
