/** Linocut look: each theme is paper + ink + one accent colour, like a two-colour block print. */
export const THEMES = {
  dark: { paper: '#1b1916', ink: '#ece2cc', acc: '#e0533a', onAcc: '#fbf3e2' },
  light: { paper: '#efe6d2', ink: '#1c1a17', acc: '#d8402a', onAcc: '#f6eedc' }
} as const

export type ThemeId = keyof typeof THEMES
export const THEME_IDS = Object.keys(THEMES) as ThemeId[]
