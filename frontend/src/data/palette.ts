/* Tag and subject colors from the ench-notes design composition. */

type Hue = [bg: string, fg: string]

/** Named tag hues from the design; other tags hash into this list. */
const NAMED_HUES: Record<string, Hue> = {
  decision: ['var(--color-accent-200)', 'var(--color-accent-800)'],
  spec: ['var(--color-accent-2-200)', 'var(--color-accent-2-800)'],
  meeting: ['#e7e0ee', '#4b3d5c'],
  bug: ['#f4dcd6', '#8a3a28'],
  idea: ['#f6e7c8', '#7a5714'],
  api: ['#d9e4ea', '#31505e'],
  hiring: ['#eee2d6', '#6b503a'],
  followup: ['var(--color-neutral-200)', 'var(--color-neutral-800)'],
}

const HUE_LIST: Hue[] = Object.values(NAMED_HUES)

export function tagHue(name: string): { bg: string; fg: string } {
  const named = NAMED_HUES[name.toLowerCase()]
  if (named) return { bg: named[0], fg: named[1] }
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const [bg, fg] = HUE_LIST[h % HUE_LIST.length]
  return { bg, fg }
}

/** Subject dot colors — the design's fixed set, offered at creation. */
export const SUBJECT_COLORS = [
  '#c67139', // terracotta
  '#7a8a5e', // sage
  '#8a6fa8', // violet
  '#5d7f8f', // slate blue
  '#a13b2a', // brick
  '#7a5714', // ochre
  '#31505e', // deep teal
  '#6b503a', // umber
]

export const ALL_NOTES_COLOR = 'color-mix(in srgb, var(--color-text) 35%, transparent)'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
