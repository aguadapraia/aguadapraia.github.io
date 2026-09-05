import type { BeachViewModel, DailyBeachForecast, MapMetric } from '../types'
import { selectDiverseHighlights } from './highlight-policy'

export function forecastForDate(beach: BeachViewModel, date: string) {
  return beach.daily.find((forecast) => forecast.date === date)
}

export function forecastHighlights(beaches: readonly BeachViewModel[], date: string) {
  function top(field: keyof DailyBeachForecast, direction: 'min' | 'max', metric: MapMetric) {
    const ranked = beaches.flatMap((beach) => {
      const value = forecastForDate(beach, date)?.[field]
      return typeof value === 'number' && Number.isFinite(value) ? [{ beach, value }] : []
    }).sort((a, b) => (direction === 'max' ? b.value - a.value : a.value - b.value)
      || a.beach.name.localeCompare(b.beach.name, 'pt'))
    return selectDiverseHighlights(ranked, metric)
  }
  return {
    water: top('waterMax', 'max', 'water'),
    air: top('airMax', 'max', 'air'),
    wind: top('windAverageKnots', 'min', 'wind'),
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
