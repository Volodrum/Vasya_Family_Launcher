import type { ReactNode } from 'react'

/** Stone button in the style of the game's menus. `accent` uses the logo's orange. */
export function McButton(props: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  accent?: boolean
  wide?: boolean
  small?: boolean
  tip?: string
  type?: 'button' | 'submit'
  testId?: string
}): React.JSX.Element {
  const cls = ['mc-btn', props.accent && 'accent', props.wide && 'wide', props.small && 'small', props.tip && 'has-tip']
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type={props.type ?? 'button'}
      className={cls}
      disabled={props.disabled}
      onClick={props.onClick}
      data-tip={props.tip}
      data-testid={props.testId}
    >
      <span className="mc-btn-label">{props.children}</span>
    </button>
  )
}

/** "Label: Value" button that changes its value on click, like the game's option buttons. */
export function CycleButton(props: {
  label: string
  value: string
  onClick: () => void
  disabled?: boolean
  tip?: string
  wide?: boolean
}): React.JSX.Element {
  return (
    <McButton onClick={props.onClick} disabled={props.disabled} tip={props.tip} wide={props.wide}>
      {props.label}: {props.value}
    </McButton>
  )
}

/** Slider with the value printed on the track. Uses a real range input for keyboard and screen readers. */
export function McSlider(props: {
  label: string
  display: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  tip?: string
}): React.JSX.Element {
  const f = props.max > props.min ? (props.value - props.min) / (props.max - props.min) : 0
  return (
    <label className={`mc-slider ${props.tip ? 'has-tip' : ''}`} data-tip={props.tip}>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        aria-label={props.label}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="mc-slider-handle" style={{ left: `calc(${f} * (100% - 16px))` }} aria-hidden="true" />
      <span className="mc-slider-label" aria-hidden="true">
        {props.label}: {props.display}
      </span>
    </label>
  )
}

export function McCheckbox(props: {
  checked: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <label className={`mc-check ${props.disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="mc-check-box" aria-hidden="true">
        <svg viewBox="0 0 9 9" width="18" height="18" shapeRendering="crispEdges">
          <path d="M1 4h1v1h1v1h1V5h1V4h1V3h1V2h1v2H7v1H6v1H5v1H4v1H3V7H2V6H1z" fill="currentColor" />
        </svg>
      </span>
      <span className="mc-check-text">{props.children}</span>
    </label>
  )
}

export interface Toast {
  id: number
  kind: 'error' | 'info' | 'update'
  title: string
  body?: string
  action?: { label: string; run: () => void }
}

/** Toasts in the top-right corner, like the game's advancement pop-ups. */
export function Toasts(props: { toasts: Toast[]; onClose: (id: number) => void; closeLabel: string }): React.JSX.Element {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {props.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <div className="toast-text">
            <strong>{t.title}</strong>
            {t.body && <span>{t.body}</span>}
          </div>
          {t.action && (
            <McButton small onClick={t.action.run}>
              {t.action.label}
            </McButton>
          )}
          <button className="toast-close" aria-label={props.closeLabel} onClick={() => props.onClose(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
