export const COLOR_PALETTES: Record<string, string[]> = {
  default: [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#14b8a6', '#06b6d4', '#3b82f6', '#64748b',
  ],
  muted: [
    '#94a3b8', '#a1a1aa', '#a8a29e', '#78716c', '#737373',
    '#71717a', '#6b7280', '#64748b', '#475569', '#334155',
  ],
  warm: [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#d946ef', '#f43f5e', '#fb923c', '#fbbf24',
  ],
  cool: [
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
    '#a855f7', '#14b8a6', '#2dd4bf', '#38bdf8', '#818cf8',
  ],
}

export function getColor(palette: string, index: number): string {
  const colors = COLOR_PALETTES[palette] ?? COLOR_PALETTES.default
  return colors[index % colors.length]
}
