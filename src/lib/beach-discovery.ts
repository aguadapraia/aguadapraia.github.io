import type { BeachViewModel, DailyBeachForecast } from '../types'
import { normalizeBeachSearch } from './beach-search'

export function forecastForDate(beach: BeachViewModel, date: string) {
  return beach.daily.find((forecast) => forecast.date === date)
}

export function forecastHighlights(beaches: readonly BeachViewModel[], date: string) {
  function top(field: keyof DailyBeachForecast, direction: 'min' | 'max', count: number) {
    const ranked = beaches.flatMap((beach) => {
      const value = forecastForDate(beach, date)?.[field]
      return typeof value === 'number' && Number.isFinite(value) ? [{ beach, value }] : []
    }).sort((a, b) => (direction === 'max' ? b.value - a.value : a.value - b.value)
      || a.beach.name.localeCompare(b.beach.name, 'pt'))
    const selected: typeof ranked = []
    for (const candidate of ranked) {
      // The public catalog has municipalities, not parish boundaries.
      const locality = normalizeBeachSearch(`${candidate.beach.territory}|${candidate.beach.district}|${candidate.beach.municipality}`)
      const similar = selected.some((item) =>
        normalizeBeachSearch(`${item.beach.territory}|${item.beach.district}|${item.beach.municipality}`) === locality
        && Math.abs(item.value - candidate.value) <= 1)
      if (!similar) selected.push(candidate)
      if (selected.length === count) break
    }
    return selected
  }
  return {
    water: top('waterMax', 'max', 2),
    air: top('airMax', 'max', 2),
    wind: top('windAverageKnots', 'min', 1),
  }
}

export function nearestBeach(
  beaches: readonly BeachViewModel[],
  latitude: number,
  longitude: number,
): BeachViewModel | undefined {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new RangeError('Invalid location coordinates')
  }
  const radians = (degrees: number) => degrees * Math.PI / 180
  let result: BeachViewModel | undefined
  let shortestDistance = Number.POSITIVE_INFINITY
  for (const beach of beaches) {
    if (!Number.isFinite(beach.latitude) || !Number.isFinite(beach.longitude)) continue
    const distance =
      Math.sin(radians(beach.latitude - latitude) / 2) ** 2 +
      Math.cos(radians(latitude)) * Math.cos(radians(beach.latitude)) *
      Math.sin(radians(beach.longitude - longitude) / 2) ** 2
    if (distance < shortestDistance) {
      result = beach
      shortestDistance = distance
    }
  }
  return result
}
