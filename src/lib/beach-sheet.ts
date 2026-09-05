export type BeachSheetLevel = 'collapsed' | 'summary' | 'expanded'

const levels: BeachSheetLevel[] = ['collapsed', 'summary', 'expanded']

export function beachSheetHeight(level: BeachSheetLevel, maximum: number, summary: number): number {
  const limit = Math.max(64, maximum)
  return level === 'collapsed' ? 64 : level === 'summary' ? Math.max(64, Math.min(limit, summary)) : limit
}

export function beachSheetAfterDrag(level: BeachSheetLevel, delta: number, maximum: number, summary: number): BeachSheetLevel {
  if (Math.abs(delta) < 12) return level
  const direction = delta > 0 ? 1 : -1
  const next = Math.max(0, Math.min(2, levels.indexOf(level) + direction))
  const target = beachSheetHeight(level, maximum, summary) + delta
  return levels.reduce((closest, candidate, index) => {
    if (direction > 0 ? index < next : index > next) return closest
    return Math.abs(beachSheetHeight(candidate, maximum, summary) - target) < Math.abs(beachSheetHeight(closest, maximum, summary) - target)
      ? candidate : closest
  }, levels[next])
}
