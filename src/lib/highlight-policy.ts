import type { BeachViewModel, MapMetric } from '../types'
import { normalizeBeachSearch } from './beach-search'

// Values are in Celsius and knots, before display-unit conversion.
export const HIGHLIGHT_SIMILARITY = { temperatureCelsius: 1, windKnots: 1 } as const

export function highlightTolerance(metric: MapMetric): number {
  return metric === 'wind' ? HIGHLIGHT_SIMILARITY.windKnots : HIGHLIGHT_SIMILARITY.temperatureCelsius
}

type HighlightLocation = Pick<BeachViewModel, 'territory' | 'district' | 'municipality'>

export function municipalityKey(beach: HighlightLocation): string {
  return [beach.territory, beach.district, beach.municipality]
    .map((part) => normalizeBeachSearch(part).replace(/\s+/g, ' ')).join('|')
}

export function selectDiverseHighlights<T extends { beach: HighlightLocation; value: number }>(
  ranked: readonly T[], metric: MapMetric, count = 2,
): T[] {
  const selected: T[] = []
  for (const candidate of ranked) {
    const similar = selected.some((item) =>
      municipalityKey(item.beach) === municipalityKey(candidate.beach) &&
      Math.abs(item.value - candidate.value) <= highlightTolerance(metric))
    if (!similar) selected.push(candidate)
    if (selected.length === count) break
  }
  return selected
}
