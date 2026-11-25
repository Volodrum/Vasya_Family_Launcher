import { useEffect, useRef } from 'react'
import { THEMES, type ThemeId } from '../../shared/theme'
import { drawScene } from './scenes'

/** Puts the theme's colours into CSS variables; everything in styles.css and the scene uses them. */
export function applyTheme(theme: ThemeId): void {
  const c = THEMES[theme] ?? THEMES.dark
  const root = document.documentElement.style
  root.setProperty('--paper', c.paper)
  root.setProperty('--ink', c.ink)
  root.setProperty('--acc', c.acc)
  root.setProperty('--on-acc', c.onAcc)
  document.documentElement.style.colorScheme = theme
}

/**
 * Shared SVG pieces, rendered once:
 * - vf-rough: wobbly edges plus tiny paper specks, for carved art and big titles
 * - vf-edge: wobbly edges only, for buttons (keeps their text clean)
 * - vf-grain: paper grain over the whole background
 * - vf-v: the double-rim V logo, re-cut as a linocut (accent rim, paper gap, ink V)
 */
export function ArtDefs(): React.JSX.Element {
  return (
    <svg className="art-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="vf-rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={3} result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale={4} xChannelSelector="R" yChannelSelector="G" result="d" />
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={1} seed={8} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -6 4.9" result="holes" />
          <feComposite in="d" in2="holes" operator="in" />
        </filter>
        <filter id="vf-edge" x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves={2} seed={7} result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale={3} xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="vf-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves={3} seed={2} />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.09" />
          </feComponentTransfer>
        </filter>
        {/* Coloured with inline styles: CSS selectors cannot reach inside <use>, but variables inherit. */}
        <symbol id="vf-v" viewBox="0 0 100 100">
          <path style={{ fill: 'var(--acc)' }} d="M4 10 L36 10 L50 46 L64 10 L96 10 L62 94 L38 94 Z" />
          <path style={{ fill: 'var(--paper)' }} d="M14 17 L32 17 L50 62 L68 17 L86 17 L58 87 L42 87 Z" />
          <path style={{ fill: 'var(--ink)' }} d="M21 22 L31 22 L50 70 L69 22 L79 22 L55 82 L45 82 Z" />
          <path style={{ fill: 'none', stroke: 'var(--paper)' }} strokeWidth={2.5} d="M28 28 L44 68 M33 26 L47 62 M72 28 L56 68" />
        </symbol>
      </defs>
    </svg>
  )
}

export function VLogo({ size }: { size: number }): React.JSX.Element {
  return (
    <svg className="vf-art v-logo" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <use href="#vf-v" />
    </svg>
  )
}

/** The carved background scene, filling its parent (cropped, kept anchored to the bottom). */
export function Scene(): React.JSX.Element {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (ref.current) drawScene(ref.current)
  }, [])
  return <svg ref={ref} className="vf-art scene" viewBox="0 0 1100 680" preserveAspectRatio="xMidYMax slice" aria-hidden="true" />
}
