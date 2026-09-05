import { describe, expect, it } from 'vitest'
import type { BeachViewModel } from '../types'
import { forecastForDate, forecastHighlights, nearestBeach } from './beach-discovery'
import { normalizeBeachSearch } from './beach-search'

function beach(id: string, latitude: number, longitude: number, waterMax: number): BeachViewModel {
  return {
    id, name: id, latitude, longitude, sourceLatitude: latitude, sourceLongitude: longitude,
    territory: 'mainland', district: 'Lisboa', municipality: 'Sintra', history: [],
    daily: [{
      date: '2026-09-04', waterMax, waterMin: 17, waterMinHour: 8, waterMaxHour: 12,
      airMin: 20, airMax: 26, airMinHour: null, airMaxHour: null,
      airLocation: 'Sintra', airDistanceKm: 2,
      windMinKnots: 3, windMaxKnots: 12, windAverageKnots: 7,
      windAt13Knots: 8, windMinHour: 8, windMaxHour: 16,
    }],
  }
}

describe('beach discovery', () => {
  it('finds Portuguese names without accents or case sensitivity', () => {
    expect(normalizeBeachSearch('  PRAIA DAS MAÇÃS ')).toBe('praia das macas')
    expect(normalizeBeachSearch('São João')).toContain('sao joao')
  })

  it('finds the nearest beach using both latitude and longitude', () => {
    const nearby = beach('near', 38.8, -9.4, 19)
    expect(nearestBeach([beach('far', 37.1, -7.6, 24), nearby], 38.79, -9.41)).toBe(nearby)
  })

  it('works in the islands and does not mutate catalog order', () => {
    const catalog = [beach('mainland', 38.8, -9.4, 19), beach('azores', 37.7, -25.6, 23)]
    expect(nearestBeach(catalog, 37.72, -25.59)?.id).toBe('azores')
    expect(catalog[0]?.id).toBe('mainland')
  })

  it('handles an empty catalog and rejects invalid coordinates', () => {
    expect(nearestBeach([], 0, 0)).toBeUndefined()
    expect(() => nearestBeach([], Number.NaN, 0)).toThrow(RangeError)
    expect(() => nearestBeach([], 91, 0)).toThrow(RangeError)
  })

  it('ignores missing metrics and does not reuse another forecast date', () => {
    const catalog = [beach('missing', 38, -9, Number.NaN), beach('warm', 37, -8, 24)]
    expect(forecastHighlights(catalog, '2026-09-04').water.map((item) => item.beach.id)).toEqual(['warm'])
    expect(forecastHighlights(catalog, '2026-09-05').water).toEqual([])
    expect(forecastForDate(catalog[1]!, '2026-09-05')).toBeUndefined()
    expect(forecastForDate(catalog[1]!, '2026-09-04')?.waterMax).toBe(24)
  })

  it('ranks two warmest beaches per temperature and one calmest without changing catalog order', () => {
    const catalog = [beach('C', 38, -9, 19), beach('B', 38, -9, 22), beach('A', 38, -9, 22)]
    catalog[1].municipality = 'Cascais'
    catalog[0].daily[0].airMax = 30
    catalog[1].daily[0].windAverageKnots = 0
    const result = forecastHighlights(catalog, '2026-09-04')
    expect(result.water.map((item) => item.beach.id)).toEqual(['A', 'B'])
    expect(result.air.map((item) => item.beach.id)).toEqual(['C', 'A'])
    expect(result.wind.map((item) => item.beach.id)).toEqual(['B'])
    expect(catalog.map((item) => item.id)).toEqual(['C', 'B', 'A'])
  })

  it('prefers another municipality over a nearby equal-temperature runner-up', () => {
    const first = beach('A', 38, -9, 22)
    const nearby = beach('B', 38, -9, 21.9)
    const elsewhere = { ...beach('C', 37, -8, 21.8), municipality: 'Cascais' }
    expect(forecastHighlights([nearby, elsewhere, first], '2026-09-04').water.map((item) => item.beach.id))
      .toEqual(['A', 'C'])
  })

  it('allows the same municipality only beyond one degree and only while still next in rank', () => {
    const first = beach('A', 38, -9, 23)
    const oneDegree = beach('B', 38, -9, 22)
    const different = beach('C', 38, -9, 21.9)
    const elsewhere = { ...beach('D', 37, -8, 21.5), municipality: 'Cascais' }
    expect(forecastHighlights([first, oneDegree, different, elsewhere], '2026-09-04').water.map((item) => item.beach.id))
      .toEqual(['A', 'C'])
    expect(forecastHighlights([first, oneDegree], '2026-09-04').water).toHaveLength(1)
  })
})
