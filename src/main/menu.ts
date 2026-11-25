/**
 * The in-game main menu and pause menu, drawn by FancyMenu in the launcher's linocut style.
 *
 * Before every start the launcher writes:
 * - resourcepacks/vasyafamily-menu/: a small resource pack with the menu pictures (tools/make-menu-art.mjs)
 *   and the Rizba font, switched on in options.txt so FancyMenu and the button labels can use them;
 * - config/fancymenu/customization/vasyafamily_*.txt: the two FancyMenu layouts, with labels in the
 *   launcher's language, the address from Options → Connection and pictures for the current theme.
 * Players can't edit the menus: FancyMenu's editing toolbar is switched off (config/fancymenu/options.txt).
 * Leaving the server opens the main menu, never the server list (the No Multiplayer Menu mod).
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Language } from '../shared/types'
import { THEMES, type ThemeId } from '../shared/theme'
import rizbaFont from '../renderer/src/assets/fonts/Rizba.otf?asset'
import bgDark from './menu-assets/bg_dark.png?asset'
import bgLight from './menu-assets/bg_light.png?asset'
import logoDark from './menu-assets/logo_dark.png?asset'
import logoLight from './menu-assets/logo_light.png?asset'
import buttonDark from './menu-assets/button_dark.png?asset'
import buttonLight from './menu-assets/button_light.png?asset'
import buttonHoverDark from './menu-assets/button_hover_dark.png?asset'
import buttonHoverLight from './menu-assets/button_hover_light.png?asset'
import accentDark from './menu-assets/button_accent_dark.png?asset'
import accentLight from './menu-assets/button_accent_light.png?asset'
import accentHoverDark from './menu-assets/button_accent_hover_dark.png?asset'
import accentHoverLight from './menu-assets/button_accent_hover_light.png?asset'

/** Folder name of the menu resource pack; the pack lock in packs.ts leaves it alone. */
export const MENU_PACK = 'vasyafamily-menu'

const PICTURES: Record<string, string> = {
  'bg_dark.png': bgDark,
  'bg_light.png': bgLight,
  'logo_dark.png': logoDark,
  'logo_light.png': logoLight,
  'button_dark.png': buttonDark,
  'button_light.png': buttonLight,
  'button_hover_dark.png': buttonHoverDark,
  'button_hover_light.png': buttonHoverLight,
  'button_accent_dark.png': accentDark,
  'button_accent_light.png': accentLight,
  'button_accent_hover_dark.png': accentHoverDark,
  'button_accent_hover_light.png': accentHoverLight
}

const LABELS: Record<Language, Record<string, string>> = {
  en: {
    play: 'Play on Vasya Family',
    singleplayer: 'Singleplayer',
    options: 'Options',
    mods: 'Mods',
    quit: 'Quit game',
    back: 'Back to game',
    advancements: 'Advancements',
    stats: 'Statistics',
    lan: 'Open to LAN',
    menu: 'Back to main menu'
  },
  uk: {
    play: 'Грати на Vasya Family',
    singleplayer: 'Одиночна гра',
    options: 'Налаштування',
    mods: 'Моди',
    quit: 'Вийти з гри',
    back: 'Повернутися до гри',
    advancements: 'Досягнення',
    stats: 'Статистика',
    lan: 'Відкрити для мережі',
    menu: 'Головне меню'
  },
  ru: {
    play: 'Играть на Vasya Family',
    singleplayer: 'Одиночная игра',
    options: 'Настройки',
    mods: 'Моды',
    quit: 'Выйти из игры',
    back: 'Вернуться в игру',
    advancements: 'Достижения',
    stats: 'Статистика',
    lan: 'Открыть для сети',
    menu: 'Главное меню'
  }
}

type Box = { x: number; y: number; w: number; h: number }
type Style = 'plain' | 'accent'

/** Text that FancyMenu turns into a Minecraft text component in the Rizba font. */
const label = (text: string): string => JSON.stringify({ text, font: 'vasyafamily:rizba' })
const tex = (name: string): string => `[source:location]vasyafamily:textures/gui/menu/${name}`
const hexColor = (c: string): string => c.toUpperCase()

function block(type: string, props: Record<string, string | number | boolean>): string {
  return `${type} {\n${Object.entries(props).map(([k, v]) => `  ${k} = ${v}`).join('\n')}\n}\n`
}

/** Position, size, textures and label colours shared by custom and restyled vanilla buttons. */
function buttonProps(theme: ThemeId, style: Style, box: Box, text: string): Record<string, string | number | boolean> {
  const c = THEMES[theme]
  const accent = style === 'accent'
  return {
    anchor_point: 'mid-centered',
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    label: label(text),
    backgroundnormal: tex(accent ? `button_accent_${theme}.png` : `button_${theme}.png`),
    backgroundhovered: tex(accent ? `button_accent_hover_${theme}.png` : `button_hover_${theme}.png`),
    nine_slice_custom_background: true,
    nine_slice_border_x: accent ? 4 : 3,
    nine_slice_border_y: accent ? 4 : 3,
    label_base_color: hexColor(accent ? c.onAcc : c.ink),
    label_hover_color: hexColor(accent ? c.onAcc : c.paper),
    label_shadow: false,
    navigatable: true
  }
}

const vanilla = (id: string, props: Record<string, string | number | boolean>): string =>
  block('vanilla_button', { element_type: 'vanilla_button', instance_identifier: id, is_hidden: false, ...props })
const hidden = (id: string): string => block('vanilla_button', { element_type: 'vanilla_button', instance_identifier: id, is_hidden: true })

function meta(identifier: string): string {
  return block('layout-meta', {
    identifier,
    render_custom_elements_behind_vanilla: false,
    last_edited_time: 0,
    is_enabled: true,
    widget_identifier_revision: 2,
    randommode: false,
    randomgroup: 1,
    randomonlyfirsttime: false,
    layout_index: 0
  })
}

export function titleLayout(theme: ThemeId, lang: Language, address: string): string {
  const t = LABELS[lang] ?? LABELS.en
  return [
    'type = fancymenu_layout\n',
    meta('title_screen'),
    block('menu_background', {
      background_type: 'image',
      instance_identifier: 'vf_background',
      image_path: tex(`bg_${theme}.png`),
      slide: false,
      repeat_texture: false,
      parallax: false
    }),
    block('customization', { action: 'backgroundoptions', keepaspectratio: true }),
    block('element', {
      element_type: 'image',
      instance_identifier: 'vf_logo',
      source: tex(`logo_${theme}.png`),
      anchor_point: 'top-centered',
      x: -90,
      y: 6,
      width: 180,
      height: 94,
      stay_on_screen: true
    }),
    block('element', {
      element_type: 'custom_button',
      instance_identifier: 'vf_play',
      ...buttonProps(theme, 'accent', { x: -100, y: -12, w: 200, h: 24 }, t.play),
      [`[executable_action_instance:vf_join][action_type:joinserver]`]: address
    }),
    vanilla('mc_titlescreen_singleplayer_button', buttonProps(theme, 'plain', { x: -100, y: 16, w: 200, h: 20 }, t.singleplayer)),
    vanilla('mc_titlescreen_options_button', buttonProps(theme, 'plain', { x: -100, y: 40, w: 98, h: 20 }, t.options)),
    vanilla('titlescreen_mods_button', buttonProps(theme, 'plain', { x: 2, y: 40, w: 98, h: 20 }, t.mods)),
    vanilla('mc_titlescreen_quit_button', buttonProps(theme, 'plain', { x: -76, y: 64, w: 152, h: 20 }, t.quit)),
    vanilla('mc_titlescreen_language_button', { anchor_point: 'mid-centered', x: -100, y: 64, width: 20, height: 20 }),
    vanilla('mc_titlescreen_accessibility_button', { anchor_point: 'mid-centered', x: 80, y: 64, width: 20, height: 20 }),
    hidden('mc_titlescreen_multiplayer_button'),
    hidden('mc_titlescreen_realms_button'),
    hidden('minecraft_logo_widget'),
    hidden('minecraft_splash_widget'),
    hidden('minecraft_realms_notification_icons_widget')
  ].join('\n')
}

export function pauseLayout(theme: ThemeId, lang: Language): string {
  const t = LABELS[lang] ?? LABELS.en
  return [
    'type = fancymenu_layout\n',
    meta('pause_screen'),
    vanilla('pause_return_to_game_button', buttonProps(theme, 'plain', { x: -102, y: -44, w: 204, h: 20 }, t.back)),
    vanilla('pause_advancements_button', buttonProps(theme, 'plain', { x: -102, y: -20, w: 100, h: 20 }, t.advancements)),
    vanilla('pause_stats_button', buttonProps(theme, 'plain', { x: 2, y: -20, w: 100, h: 20 }, t.stats)),
    vanilla('pause_options_button', buttonProps(theme, 'plain', { x: -102, y: 4, w: 204, h: 20 }, t.options)),
    vanilla('pause_disconnect_button', buttonProps(theme, 'accent', { x: -102, y: 34, w: 204, h: 24 }, t.menu)),
    // Only exists in singleplayer, so it goes last: on the server there is no gap.
    vanilla('pause_share_to_lan_button', buttonProps(theme, 'plain', { x: -102, y: 66, w: 204, h: 20 }, t.lan)),
    hidden('pause_feedback_button'),
    hidden('pause_send_feedback_button'),
    hidden('pause_report_bugs_button'),
    hidden('pause_server_links_button'),
    hidden('pause_player_reporting_button')
  ].join('\n')
}

async function writeIfChanged(file: string, text: string): Promise<void> {
  const old = await readFile(file, 'utf8').catch(() => null)
  if (old !== text) await writeFile(file, text)
}

/** Minecraft keeps the enabled resource packs as a JSON list on one line of options.txt. */
async function enableMenuPack(instanceDir: string): Promise<void> {
  const file = join(instanceDir, 'options.txt')
  const lines = (await readFile(file, 'utf8').catch(() => 'version:3465')).split(/\r?\n/)
  const entry = `file/${MENU_PACK}`
  const read = (key: string): string[] => {
    const line = lines.find((l) => l.startsWith(`${key}:`))
    try {
      return line ? (JSON.parse(line.slice(key.length + 1)) as string[]) : []
    } catch {
      return []
    }
  }
  const put = (key: string, list: string[]): void => {
    const text = `${key}:${JSON.stringify(list)}`
    const i = lines.findIndex((l) => l.startsWith(`${key}:`))
    if (i >= 0) lines[i] = text
    else lines.splice(lines.length && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length, 0, text)
  }
  // A brand-new game folder would open Minecraft's one-time accessibility screen instead of the new main menu.
  const onboarding = !lines.some((l) => l.startsWith('onboardAccessibility:'))
  if (onboarding) lines.splice(lines.length && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length, 0, 'onboardAccessibility:false')
  const selected = read('resourcePacks')
  const list = selected.length ? selected : ['vanilla']
  if (list.includes(entry)) {
    if (onboarding) await writeFile(file, lines.join('\n').replace(/\n?$/, '\n'))
    return
  }
  // Lowest priority, right above vanilla: the pack only adds new files, it never replaces any.
  const at = list.indexOf('vanilla') + 1
  list.splice(at, 0, entry)
  put('resourcePacks', list)
  const incompatible = read('incompatibleResourcePacks')
  if (incompatible.includes(entry)) put('incompatibleResourcePacks', incompatible.filter((e) => e !== entry))
  await writeFile(file, lines.join('\n').replace(/\n?$/, '\n'))
}

/**
 * FancyMenu only applies layouts to screens listed in customizablemenus.txt, by their runtime class name
 * (Fabric intermediary names: class_442 = TitleScreen, class_433 = PauseScreen). Adds ours, keeps any others.
 */
async function enableCustomization(instanceDir: string): Promise<void> {
  const file = join(instanceDir, 'config', 'fancymenu', 'customizablemenus.txt')
  const old = await readFile(file, 'utf8').catch(() => null)
  let text = old && /^type\s*=\s*customizablemenus/m.test(old) ? old.replace(/\s*$/, '\n') : 'type = customizablemenus\n'
  for (const screen of ['net.minecraft.class_442', 'net.minecraft.class_433']) {
    if (!new RegExp(`^${screen.replace(/\./g, '\\.')}\\s*\\{`, 'm').test(text)) text += `\n${screen} {\n}\n`
  }
  if (text !== old) await writeFile(file, text)
}

/**
 * Mod Menu: no extra Mods button in the pause menu (it would sit on top of our layout; mod settings
 * stay in the main menu's Mods button) and no update checks / update badge.
 */
async function tuneModMenu(instanceDir: string): Promise<void> {
  const file = join(instanceDir, 'config', 'modmenu.json')
  const old = await readFile(file, 'utf8').catch(() => null)
  let config: Record<string, unknown> = {}
  try {
    config = old ? (JSON.parse(old) as Record<string, unknown>) : {}
  } catch {
    config = {}
  }
  const next = { ...config, modify_game_menu: false, update_checker: false, button_update_badge: false }
  const text = JSON.stringify(next, null, 2)
  if (text !== old) await writeFile(file, text)
}

/** Hides FancyMenu's editing toolbar, so players can't change the menus. */
async function lockFancyMenu(instanceDir: string): Promise<void> {
  const file = join(instanceDir, 'config', 'fancymenu', 'options.txt')
  const old = await readFile(file, 'utf8').catch(() => null)
  const want = "B:show_customization_overlay = 'false';"
  if (old === null) {
    await writeFile(file, `##[customization]\n${want}\n`)
    return
  }
  const next = /show_customization_overlay\s*=\s*'?true'?/.test(old) ? old.replace(/B:show_customization_overlay\s*=\s*'?true'?;?/, want) : old
  if (next !== old) await writeFile(file, next)
}

export async function writeMenu(instanceDir: string, opts: { theme: ThemeId; language: Language; address: string }): Promise<void> {
  const pack = join(instanceDir, 'resourcepacks', MENU_PACK)
  const pictures = join(pack, 'assets', 'vasyafamily', 'textures', 'gui', 'menu')
  const fonts = join(pack, 'assets', 'vasyafamily', 'font')
  await mkdir(pictures, { recursive: true })
  await mkdir(fonts, { recursive: true })
  await writeIfChanged(
    join(pack, 'pack.mcmeta'),
    JSON.stringify({ pack: { pack_format: 15, description: 'Vasya Family menu (installed by the launcher)' } }, null, 2)
  )
  for (const [name, src] of Object.entries(PICTURES)) await copyFile(src, join(pictures, name))
  await copyFile(rizbaFont, join(fonts, 'rizba.otf'))
  // Letters Rizba doesn't have (lowercase only maps to capitals; symbols like ▶) fall back to Minecraft's font.
  await writeIfChanged(
    join(fonts, 'rizba.json'),
    JSON.stringify({ providers: [{ type: 'ttf', file: 'vasyafamily:rizba.otf', size: 11, oversample: 4, shift: [0, 0.5] }, { type: 'reference', id: 'minecraft:default' }] }, null, 2)
  )
  await enableMenuPack(instanceDir)

  const layouts = join(instanceDir, 'config', 'fancymenu', 'customization')
  await mkdir(layouts, { recursive: true })
  await writeIfChanged(join(layouts, 'vasyafamily_title_screen.txt'), titleLayout(opts.theme, opts.language, opts.address))
  await writeIfChanged(join(layouts, 'vasyafamily_pause_screen.txt'), pauseLayout(opts.theme, opts.language))
  await enableCustomization(instanceDir)
  await lockFancyMenu(instanceDir)
  await tuneModMenu(instanceDir)
}
