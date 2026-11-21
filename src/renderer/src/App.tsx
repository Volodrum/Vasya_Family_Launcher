import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameEvent, Language, LauncherState, ModEntry, PlayMode, ProgressEvent, Settings } from '../../shared/types'
import { NICKNAME_RE } from '../../shared/types'
import { LANGUAGES, SPLASHES, stageKey, translate, type Key } from './i18n'
import { CycleButton, McButton, McCheckbox, McSlider, Toasts, type Toast } from './ui'
import { headFor } from './textures'
import { renderBody, renderHead, useRendered, useSkin } from './skin'
import banner from './assets/season1.webp'
import logo from './assets/logo.png'

type T = (key: Key, vars?: Record<string, string | number>) => string
type Screen = 'title' | 'options' | 'mods'

function isBusy(p: ProgressEvent): boolean {
  return !['idle', 'error', 'running'].includes(p.stage)
}

function nextLanguage(l: Language): Language {
  const i = LANGUAGES.findIndex((x) => x.id === l)
  return LANGUAGES[(i + 1) % LANGUAGES.length].id
}

const languageLabel = (l: Language): string => LANGUAGES.find((x) => x.id === l)?.label ?? l

export function App(): React.JSX.Element {
  const [state, setState] = useState<LauncherState | null>(null)
  const [progress, setProgress] = useState<ProgressEvent>({ stage: 'idle', fraction: 1 })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [screen, setScreen] = useState<Screen>('title')
  const [editingNick, setEditingNick] = useState(false)
  const toastId = useRef(0)

  const lang: Language = state?.settings.language ?? 'en'
  const t: T = useCallback((key, vars) => translate(lang, key, vars), [lang])
  const tRef = useRef(t)
  tRef.current = t

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = ++toastId.current
    setToasts((list) => [...list.slice(-2), { ...toast, id }])
    if (toast.kind === 'info') setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 6000)
  }, [])

  useEffect(() => {
    void window.vf.getState().then(setState)
    const offProgress = window.vf.onProgress((e) => {
      setProgress(e)
      if (e.stage === 'error') pushToast({ kind: 'error', title: tRef.current('stage.error'), body: e.detail })
    })
    const offGame = window.vf.onGame((e: GameEvent) => {
      setState((s) => (s ? { ...s, gameRunning: e.type === 'started' || e.type === 'window-ready' } : s))
      if (e.type === 'exited' && e.code !== undefined && e.code !== 0) {
        pushToast({ kind: 'error', title: tRef.current('stage.error'), body: tRef.current('game.crashed', { code: e.code }) })
      }
      if (e.type === 'error') pushToast({ kind: 'error', title: tRef.current('stage.error'), body: e.message })
    })
    const offUpdate = window.vf.onUpdate((e) => {
      if (e.type === 'available') pushToast({ kind: 'info', title: tRef.current('toast.updating', { v: e.version ?? '' }) })
      if (e.type === 'downloaded') {
        pushToast({
          kind: 'update',
          title: tRef.current('toast.update', { v: e.version ?? '' }),
          body: tRef.current('toast.updateHint'),
          action: { label: tRef.current('toast.restart'), run: () => void window.vf.installUpdate() }
        })
      }
    })
    return () => {
      offProgress()
      offGame()
      offUpdate()
    }
  }, [pushToast])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    if (state?.manifestError && !state.manifest) pushToast({ kind: 'error', title: tRef.current('stage.error'), body: tRef.current('manifest.error') })
  }, [state?.manifestError, state?.manifest, pushToast])

  const save = async (patch: Partial<Settings>): Promise<void> => {
    const settings = await window.vf.saveSettings(patch)
    setState((s) => (s ? { ...s, settings } : s))
  }

  if (!state) return <div className="app" />

  const busy = isBusy(progress)
  const locked = busy || state.gameRunning
  const needsNick = !state.settings.nickname || editingNick

  const play = async (mode: PlayMode): Promise<void> => {
    try {
      await window.vf.play(mode)
    } catch {
      /* reported through the progress 'error' event */
    }
  }

  return (
    <div className={`app ${needsNick || screen !== 'title' ? 'menu-bg' : ''}`}>
      <div className="panorama" style={{ backgroundImage: `url(${banner})` }} aria-hidden="true" />
      <TitleBar t={t} />
      {needsNick ? (
        <NicknameScreen
          t={t}
          initial={state.settings.nickname}
          language={lang}
          canCancel={!!state.settings.nickname}
          onLanguage={() => save({ language: nextLanguage(lang) })}
          onCancel={() => setEditingNick(false)}
          onDone={async (nickname) => {
            await save({ nickname })
            setEditingNick(false)
          }}
        />
      ) : screen === 'options' ? (
        <OptionsScreen
          t={t}
          state={state}
          locked={locked}
          onSave={save}
          onMods={() => setScreen('mods')}
          onDone={() => setScreen('title')}
          onRepair={async () => {
            setScreen('title')
            try {
              await window.vf.repair()
              pushToast({ kind: 'info', title: t('toast.info'), body: t('toast.repairDone') })
            } catch {
              /* reported through the progress 'error' event */
            }
          }}
        />
      ) : screen === 'mods' ? (
        <ModsScreen t={t} state={state} locked={locked} onSave={save} onDone={() => setScreen('options')} />
      ) : (
        <TitleScreen
          t={t}
          state={state}
          progress={progress}
          onPlay={play}
          onServer={() => {
            const servers = state.manifest?.servers ?? []
            if (!servers.length) return
            const i = servers.findIndex((s) => s.id === state.settings.serverId)
            void save({ serverId: servers[(i + 1) % servers.length].id })
          }}
          onOptions={() => setScreen('options')}
          onChangeNick={() => setEditingNick(true)}
        />
      )}
      <Toasts toasts={toasts} closeLabel={t('close')} onClose={(id) => setToasts((l) => l.filter((x) => x.id !== id))} />
    </div>
  )
}

function TitleBar({ t }: { t: T }): React.JSX.Element {
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <img className="brand-mark" src={logo} alt="" width={22} height={22} />
        Vasya Family Launcher
      </div>
      <div className="titlebar-controls">
        <button className="win-btn" aria-label={t('minimize')} title={t('minimize')} onClick={() => window.vf.minimize()}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" shapeRendering="crispEdges">
            <rect x="2" y="6" width="8" height="2" fill="currentColor" />
          </svg>
        </button>
        <button className="win-btn close" aria-label={t('close')} title={t('close')} onClick={() => window.vf.close()}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" shapeRendering="crispEdges">
            <path d="M2 2h2v2H2zM4 4h2v2H4zM6 6h2v2H6zM8 8h2v2H8zM8 2h2v2H8zM6 4h2v2H6zM4 6h2v2H4zM2 8h2v2H2z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </header>
  )
}

function serverLabel(t: T, id: string, fallback: string): string {
  if (id === 'main') return t('server.main')
  if (id === 'anycast') return t('server.anycast')
  if (id === 'direct') return t('server.direct')
  return fallback
}

function TitleScreen(props: {
  t: T
  state: LauncherState
  progress: ProgressEvent
  onPlay: (mode: PlayMode) => void
  onServer: () => void
  onOptions: () => void
  onChangeNick: () => void
}): React.JSX.Element {
  const { t, state, progress } = props
  const busy = isBusy(progress)
  const running = state.gameRunning
  const locked = busy || running
  const lang = state.settings.language
  const splash = useMemo(() => {
    const list = SPLASHES[lang]
    return list[Math.floor(Math.random() * list.length)]
  }, [lang])
  const servers = state.manifest?.servers ?? []
  const server = servers.find((s) => s.id === state.settings.serverId) ?? servers[0]
  // Real skin face when the nickname has one (Mojang / Ely.by), otherwise a generated face.
  const fallbackHead = useMemo(() => headFor(state.settings.nickname), [state.settings.nickname])
  const skinHead = useRendered(useSkin(state.settings.nickname), renderHead)
  const head = skinHead ?? fallbackHead

  return (
    <main className="title-screen">
      <div className="player-chip">
        <img className="head" src={head} alt="" width={36} height={36} />
        <span className="player-name">{state.settings.nickname}</span>
        <McButton small onClick={props.onChangeNick} disabled={locked} testId="change-nick">
          {t('title.change')}
        </McButton>
      </div>

      <div className="logo-area">
        <div className="logo" style={{ backgroundImage: `url(${banner})` }} role="img" aria-label="Vasya Family — Season 1" />
        <span className="splash">{splash}</span>
      </div>

      <div className="menu">
        {busy || running ? (
          <LoadingPanel t={t} progress={progress} running={running} />
        ) : (
          <>
            <McButton accent wide disabled={!state.manifest} onClick={() => props.onPlay('server')} testId="play-server">
              ▶ {t('title.playServer')}
            </McButton>
            <McButton wide disabled={!state.manifest} onClick={() => props.onPlay('local')} testId="play-local">
              {t('title.singleplayer')}
            </McButton>
            <div className="menu-row">
              <CycleButton
                label={t('title.server')}
                value={server ? serverLabel(t, server.id, server.name) : '—'}
                tip={server ? t('title.serverTip', { a: server.address }) : undefined}
                onClick={props.onServer}
                disabled={servers.length < 2}
              />
              <McButton onClick={props.onOptions} testId="options">
                {t('title.options')}
              </McButton>
            </div>
          </>
        )}
      </div>

      <footer className="corner-text">
        <span>{t('footer.launcher', { v: state.appVersion })}</span>
        <span>
          {state.manifest
            ? `Minecraft ${state.manifest.minecraft} · Fabric ${state.manifest.loader.version} · ${t('footer.pack', { v: state.manifest.packVersion })}`
            : ''}
        </span>
      </footer>
    </main>
  )
}

function LoadingPanel({ t, progress, running }: { t: T; progress: ProgressEvent; running: boolean }): React.JSX.Element {
  const key = stageKey(progress.stage)
  const text = running ? t('stage.running') : progress.detail === 'verify' ? t('stage.verify') : key ? t(key) : ''
  const indeterminate = !running && progress.fraction < 0
  const sub = running
    ? t('stage.runningHint')
    : (progress.stage === 'mods' || progress.stage === 'packs') && progress.detail && progress.detail !== 'verify'
      ? progress.detail
      : ' '
  return (
    <div className="loading-panel" aria-live="polite">
      <div className="loading-title">
        <span>{text}</span>
        {!running && progress.fraction >= 0 && <span className="pct">{Math.round(progress.fraction * 100)}%</span>}
      </div>
      <div className={`mc-bar ${indeterminate ? 'indeterminate' : ''} ${running ? 'running' : ''}`}>
        <div className="mc-bar-fill" style={{ width: `${running ? 100 : Math.max(0, progress.fraction) * 100}%` }} />
      </div>
      <div className="loading-sub">{sub}</div>
    </div>
  )
}

function OptionsScreen(props: {
  t: T
  state: LauncherState
  locked: boolean
  onSave: (patch: Partial<Settings>) => Promise<void>
  onMods: () => void
  onDone: () => void
  onRepair: () => void
}): React.JSX.Element {
  const { t, state } = props
  const s = state.settings
  const maxMb = Math.max(2048, Math.floor((state.totalMemoryMb - 1024) / 512) * 512)
  useEscape(props.onDone)

  return (
    <main className="sub-screen">
      <h1 className="screen-title">{t('options.title')}</h1>
      <div className="options-grid">
        <CycleButton label={t('options.language')} value={languageLabel(s.language)} onClick={() => void props.onSave({ language: nextLanguage(s.language) })} />
        <McSlider
          label={t('options.memory')}
          display={`${(Math.min(s.memoryMb, maxMb) / 1024).toFixed(1)} ${t('unit.gb')}`}
          min={2048}
          max={maxMb}
          step={512}
          value={Math.min(s.memoryMb, maxMb)}
          tip={t('options.memoryTip', { total: Math.round(state.totalMemoryMb / 1024) })}
          onChange={(memoryMb) => void props.onSave({ memoryMb })}
        />
        <CycleButton
          label={t('options.hide')}
          value={s.closeOnLaunch ? t('on') : t('off')}
          tip={t('options.hideTip')}
          onClick={() => void props.onSave({ closeOnLaunch: !s.closeOnLaunch })}
        />
        <McButton onClick={props.onMods} testId="mods">
          {t('options.mods')}
        </McButton>
        <div className="options-gap" />
        <div className="options-gap" />
        <McButton onClick={() => void window.vf.openFolder('resourcepacks')}>{t('options.resourcepacks')}</McButton>
        <McButton onClick={() => void window.vf.openFolder('shaderpacks')}>{t('options.shaderpacks')}</McButton>
        <McButton onClick={() => void window.vf.openFolder('screenshots')}>{t('options.screenshots')}</McButton>
        <McButton onClick={() => void window.vf.openFolder('game')}>{t('options.game')}</McButton>
        <McButton onClick={() => void window.vf.openFolder('logs')}>{t('options.logs')}</McButton>
        <McButton onClick={props.onRepair} disabled={props.locked || !state.manifest} tip={t('options.repairTip')}>
          {t('options.repair')}
        </McButton>
      </div>
      <p className="screen-note">{t('options.memoryTip', { total: Math.round(state.totalMemoryMb / 1024) })}</p>
      <div className="screen-bottom">
        <McButton wide onClick={props.onDone} testId="done">
          {t('done')}
        </McButton>
      </div>
    </main>
  )
}

function ModsScreen(props: {
  t: T
  state: LauncherState
  locked: boolean
  onSave: (patch: Partial<Settings>) => Promise<void>
  onDone: () => void
}): React.JSX.Element {
  const { t, state } = props
  const s = state.settings
  const optional = useMemo(() => (state.manifest?.mods ?? []).filter((m) => m.optional), [state.manifest])
  const names = useMemo(() => new Map((state.manifest?.mods ?? []).map((m) => [m.id, m.name])), [state.manifest])
  const enabled = (m: ModEntry): boolean => s.optionalMods[m.id] ?? m.default
  useEscape(props.onDone)

  const toggle = (mod: ModEntry, on: boolean): void => {
    const next = { ...s.optionalMods, [mod.id]: on }
    // Keep dependencies consistent: enabling Iris enables Sodium, disabling Sodium disables Iris.
    if (on) for (const r of mod.requires) next[r] = true
    else for (const other of optional) if (other.requires.includes(mod.id)) next[other.id] = false
    void props.onSave({ optionalMods: next })
  }

  return (
    <main className="sub-screen">
      <h1 className="screen-title">{t('mods.title')}</h1>
      <p className="screen-subtitle">{t('mods.subtitle')}</p>
      <div className="list-panel">
        {optional.map((m) => (
          <McCheckbox key={m.id} checked={enabled(m)} disabled={props.locked} onChange={(on) => toggle(m, on)}>
            <span className="mod-name">{m.name}</span>
            <span className="mod-sub">
              {m.requires.length ? t('mods.needs', { mods: m.requires.map((r) => names.get(r) ?? r).join(', ') }) : m.version}
            </span>
          </McCheckbox>
        ))}
      </div>
      <p className="screen-note">{t('mods.changesNext')}</p>
      <div className="screen-bottom">
        <McButton wide onClick={props.onDone} testId="done">
          {t('done')}
        </McButton>
      </div>
    </main>
  )
}

function NicknameScreen(props: {
  t: T
  initial: string
  language: Language
  canCancel: boolean
  onLanguage: () => void
  onCancel: () => void
  onDone: (nick: string) => Promise<void>
}): React.JSX.Element {
  const { t } = props
  const [nick, setNick] = useState(props.initial)
  const valid = NICKNAME_RE.test(nick)
  useEscape(props.canCancel ? props.onCancel : () => undefined)
  return (
    <main className="sub-screen">
      <div className="nick-layout">
      <SkinPreview t={t} nickname={valid ? nick : ''} />
      <form
        className="nick-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) void props.onDone(nick)
        }}
      >
        <h1 className="screen-title">{t('login.title')}</h1>
        <p className="screen-subtitle">{t('login.subtitle')}</p>
        <label className="field">
          <span className="field-label">{t('login.label')}</span>
          <input
            autoFocus
            className={`mc-input ${nick && !valid ? 'invalid' : ''}`}
            value={nick}
            maxLength={16}
            spellCheck={false}
            onChange={(e) => setNick(e.target.value.trim())}
          />
        </label>
        <p className={`field-hint ${nick && !valid ? 'bad' : ''}`}>{t('login.rules')}</p>
        <div className="nick-buttons">
          <McButton type="submit" accent wide disabled={!valid}>
            {t('login.continue')}
          </McButton>
          <CycleButton wide label={t('login.language')} value={languageLabel(props.language)} onClick={props.onLanguage} />
        </div>
        <div className="auth-note">
          <strong>{t('login.authTitle')}</strong>
          <span>{t('login.authFirst')}</span>
          <code>
            /register &lt;{t('login.authPassword')}&gt; &lt;{t('login.authPassword')}&gt;
          </code>
          <span>{t('login.authNext')}</span>
          <code>/login &lt;{t('login.authPassword')}&gt;</code>
        </div>
      </form>
      </div>
    </main>
  )
}

/** Full-body preview of the skin that belongs to the typed nickname (no login needed). */
function SkinPreview({ t, nickname }: { t: T; nickname: string }): React.JSX.Element {
  const skin = useSkin(nickname, 450)
  const body = useRendered(skin, renderBody)
  const caption = !nickname
    ? t('skin.enterName')
    : skin === undefined
      ? t('skin.loading')
      : skin
        ? t(skin.source === 'mojang' ? 'skin.mojang' : 'skin.ely')
        : t('skin.none')
  return (
    <aside className="skin-preview" aria-live="polite">
      <div className={`skin-stage ${body ? '' : 'empty'}`}>
        {body ? <img src={body} alt={caption} width={112} height={224} /> : <span className="skin-placeholder">?</span>}
      </div>
      <span className="skin-caption">{caption}</span>
      <span className="skin-hint">{t('skin.hint')}</span>
    </aside>
  )
}

function useEscape(cb: () => void): void {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') ref.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
