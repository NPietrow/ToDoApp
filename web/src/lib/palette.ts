export interface PaletteEntry {
  tint: string
  header: string
  accent: string
}

// Fixed project colour palette, in display order (object key order is preserved).
export const PALETTE: Record<string, PaletteEntry> = {
  sage: { tint: '#e9f2e4', header: '#d6e8cd', accent: '#7fb069' },
  lavender: { tint: '#eeeaf7', header: '#ddd5f0', accent: '#9a86d0' },
  peach: { tint: '#fcebe1', header: '#f6d6c4', accent: '#e08e63' },
  sky: { tint: '#e4eff8', header: '#cfe2f2', accent: '#6fa3cf' },
  butter: { tint: '#fbf4d9', header: '#f3e7b5', accent: '#c9a94a' },
  rose: { tint: '#fbe8ec', header: '#f4d0d8', accent: '#d07a8c' },
  mint: { tint: '#e2f4f0', header: '#c9eae2', accent: '#5fae9b' },
  lilac: { tint: '#f3e8f6', header: '#e6d2ec', accent: '#b07cc0' },
  sand: { tint: '#f3eee6', header: '#e6dccd', accent: '#a8916d' },
  aqua: { tint: '#e2f2f7', header: '#c8e5ee', accent: '#4f9fb8' },
}

/** A project's colours; an unknown key (e.g. a hand-edited file) falls back to the first entry. */
export function colourOf(key: string | undefined): PaletteEntry {
  return (key !== undefined && PALETTE[key]) || PALETTE.sage
}
