import { describe, expect, it } from 'vitest'
import {
  defaultSortState,
  filterBeaches,
  getTableForecast,
  hasTableValue,
  reconcileLocationFilters,
  sortBeaches,
  toggleSort,
  type SortKey,
  type TableSortState,
} from './beach-table'
import type { BeachViewModel, DailyBeachForecast } from '../types'

function makeBeach(
  overrides: Partial<BeachViewModel> & { name: string; district: string; municipality: string },
): BeachViewModel {
  return {
    id: overrides.name,
    territory: 'mainland',
    latitude: 0,
    longitude: 0,
    sourceLatitude: 0,
    sourceLongitude: 0,
    history: [],
    daily: [
      {
        date: '2026-07-27',
        waterMin: 18,
        waterMax: 22,
        waterMinHour: 6,
        waterMaxHour: 14,
        windMinKnots: 2,
        windMaxKnots: 12,
        windMinHour: 9,
        windMaxHour: 18,
        windAverageKnots: 7,
        windAt13Knots: 8,
        airMin: 20,
        airMax: 28,
        airMinHour: 6,
        airMaxHour: 15,
        airLocation: 'Setúbal',
        airDistanceKm: 5,
      },
    ],
    ...overrides,
  }
}

const beaches: BeachViewModel[] = [
  makeBeach({ name: 'Comporta', district: 'Setúbal', municipality: 'Alcácer do Sal' }),
  makeBeach({ name: 'Albufeira', district: 'Faro', municipality: 'Albufeira' }),
  makeBeach({ name: 'Costa Nova', district: 'Aveiro', municipality: 'Ílhavo' }),
]

const DATE = '2026-07-27'
const NEXT_DATE = '2026-07-28'
const EMPTY_FILTER = { query: '', district: '', municipality: '', language: 'pt' as const }

function withForecast(name: string, forecast: Partial<DailyBeachForecast>): BeachViewModel {
  return makeBeach({
    name, district: 'Lisboa', municipality: 'Sintra',
    daily: [{ ...beaches[0].daily[0], ...forecast }],
  })
}

describe('defaultSortState', () => {
  it('returns name asc', () => {
    expect(defaultSortState()).toEqual({ key: 'name', dir: 'asc' })
  })
})

describe('toggleSort', () => {
  it('reverses direction when clicking the same column', () => {
    const state: TableSortState = { key: 'name', dir: 'asc' }
    expect(toggleSort(state, 'name')).toEqual({ key: 'name', dir: 'desc' })
  })

  it('uses default direction when switching columns', () => {
    const state: TableSortState = { key: 'name', dir: 'asc' }
    expect(toggleSort(state, 'waterMax')).toEqual({ key: 'waterMax', dir: 'desc' })
    expect(toggleSort(state, 'windAvg')).toEqual({ key: 'windAvg', dir: 'asc' })
  })

  it('toggles desc→asc for same key', () => {
    const state: TableSortState = { key: 'waterMax', dir: 'desc' }
    expect(toggleSort(state, 'waterMax')).toEqual({ key: 'waterMax', dir: 'asc' })
  })
})

describe('filterBeaches', () => {
  it('returns all beaches when no filters applied', () => {
    const result = filterBeaches(beaches, { query: '', district: '', municipality: '', language: 'pt' })
    expect(result).toHaveLength(3)
  })

  it('filters by query (beach name)', () => {
    const result = filterBeaches(beaches, { query: 'comporta', district: '', municipality: '', language: 'pt' })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Comporta')
  })

  it('filters by district', () => {
    const result = filterBeaches(beaches, { query: '', district: 'Faro', municipality: '', language: 'pt' })
    expect(result).toHaveLength(1)
    expect(result[0].district).toBe('Faro')
  })

  it('filters by municipality', () => {
    const result = filterBeaches(beaches, { query: '', district: '', municipality: 'Ílhavo', language: 'pt' })
    expect(result).toHaveLength(1)
    expect(result[0].municipality).toBe('Ílhavo')
  })

  it('returns empty when no match', () => {
    const result = filterBeaches(beaches, { query: 'xyzzy', district: '', municipality: '', language: 'pt' })
    expect(result).toHaveLength(0)
  })

  it('is case-insensitive', () => {
    const result = filterBeaches(beaches, { query: 'ALBUFEIRA', district: '', municipality: '', language: 'pt' })
    expect(result).toHaveLength(1)
  })

  it.each(['pt', 'en'] as const)('matches accents in names and locations in %s', (language) => {
    const macas = makeBeach({ name: 'Praia das Maçãs', district: 'Lisboa', municipality: 'Sintra' })
    expect(filterBeaches([macas], { ...EMPTY_FILTER, query: '  MACAS ', language })).toEqual([macas])
    expect(filterBeaches(beaches, { ...EMPTY_FILTER, query: 'ilhavo', language })).toEqual([beaches[2]])
    expect(filterBeaches(beaches, { ...EMPTY_FILTER, query: 'setubal', language })).toEqual([beaches[0]])
    expect(filterBeaches([macas], { ...EMPTY_FILTER, query: 'Mac\u0327a\u0303s', language })).toEqual([macas])
  })

  it('combines search, district and municipality', () => {
    const match = withForecast('Praia das Maçãs', { waterMin: 20, windAverageKnots: 5 })
    const otherMunicipality = { ...match, id: 'other', municipality: 'Cascais' }
    expect(filterBeaches([match, otherMunicipality], {
      ...EMPTY_FILTER, query: 'macas', district: 'Lisboa', municipality: 'Sintra',
    })).toEqual([match])
  })

  it('retains beaches without forecasts in search results', () => {
    const missingDate = withForecast('Other date', { date: NEXT_DATE })
    const noForecast = { ...beaches[0], daily: [] }
    expect(filterBeaches([missingDate, noForecast], EMPTY_FILTER)).toEqual([missingDate, noForecast])
  })
})

describe('selected forecast and location reconciliation', () => {
  it('returns only the forecast matching the selected date, never the first or history', () => {
    const beach = withForecast('Two dates', { waterMax: 22 })
    const selected = { ...beach.daily[0], date: NEXT_DATE, waterMax: 17 }
    beach.daily.push(selected)
    beach.history.push({ date: '2026-07-01', label: '1 Jul', kind: 'history', waterMax: 30 })
    expect(getTableForecast(beach, NEXT_DATE)).toBe(selected)
    expect(getTableForecast(beach, '2026-07-01')).toBeUndefined()
    expect(getTableForecast({ ...beach, daily: [] }, DATE)).toBeUndefined()
  })

  it('clears stale district and municipality after switching territory', () => {
    const island = makeBeach({ name: 'Machico', district: 'Madeira', municipality: 'Machico', territory: 'madeira' })
    const selection = reconcileLocationFilters([island], { district: 'Setúbal', municipality: 'Alcácer do Sal' })
    expect(selection).toEqual({ district: '', municipality: '' })
    expect(filterBeaches([island], { ...EMPTY_FILTER, ...selection })).toEqual([island])
  })

  it('clears a municipality outside the selected district without losing a valid district', () => {
    expect(reconcileLocationFilters(beaches, { district: 'Faro', municipality: 'Ílhavo' }))
      .toEqual({ district: 'Faro', municipality: '' })
  })

  it('preserves valid choices and accepts municipality-only filtering', () => {
    expect(reconcileLocationFilters(beaches, { district: 'Aveiro', municipality: 'Ílhavo' }))
      .toEqual({ district: 'Aveiro', municipality: 'Ílhavo' })
    expect(reconcileLocationFilters(beaches, { district: '', municipality: 'Ílhavo' }))
      .toEqual({ district: '', municipality: 'Ílhavo' })
    expect(reconcileLocationFilters([], { district: 'Aveiro', municipality: 'Ílhavo' }))
      .toEqual({ district: '', municipality: '' })
  })

  it.each([undefined, null, NaN, Infinity, -Infinity, '20'])('does not format %s as a valid reading', (value) => {
    expect(hasTableValue(value)).toBe(false)
  })
})

describe('sortBeaches', () => {
  it('sorts by name ascending', () => {
    const result = sortBeaches(beaches, { key: 'name', dir: 'asc' }, DATE, 'pt')
    expect(result.map((b) => b.name)).toEqual(['Albufeira', 'Comporta', 'Costa Nova'])
  })

  it('sorts by name descending', () => {
    const result = sortBeaches(beaches, { key: 'name', dir: 'desc' }, DATE, 'pt')
    expect(result.map((b) => b.name)).toEqual(['Costa Nova', 'Comporta', 'Albufeira'])
  })

  it('sorts by district ascending', () => {
    const result = sortBeaches(beaches, { key: 'district', dir: 'asc' }, DATE, 'pt')
    expect(result[0].district).toBe('Aveiro')
    expect(result[1].district).toBe('Faro')
    expect(result[2].district).toBe('Setúbal')
  })

  it('sorts by waterMax descending', () => {
    const varied = [
      makeBeach({ name: 'A', district: 'X', municipality: 'X', daily: [{ ...beaches[0].daily[0], waterMax: 20 }] }),
      makeBeach({ name: 'B', district: 'X', municipality: 'X', daily: [{ ...beaches[0].daily[0], waterMax: 25 }] }),
      makeBeach({ name: 'C', district: 'X', municipality: 'X', daily: [{ ...beaches[0].daily[0], waterMax: 18 }] }),
    ]
    const result = sortBeaches(varied, { key: 'waterMax', dir: 'desc' }, DATE, 'pt')
    expect(result.map((b) => b.name)).toEqual(['B', 'A', 'C'])
  })

  it('does not mutate input array', () => {
    const original = [...beaches]
    sortBeaches(beaches, { key: 'waterMax', dir: 'desc' }, DATE, 'pt')
    expect(beaches).toEqual(original)
  })

  it('sorts using the selected date rather than first-day readings', () => {
    const first = withForecast('First', { waterMax: 26 })
    const second = withForecast('Second', { waterMax: 18 })
    first.daily.push({ ...first.daily[0], date: NEXT_DATE, waterMax: 17 })
    second.daily.push({ ...second.daily[0], date: NEXT_DATE, waterMax: 23 })
    expect(sortBeaches([first, second], { key: 'waterMax', dir: 'desc' }, NEXT_DATE, 'pt')).toEqual([second, first])
  })

  it.each(['waterMin', 'waterMax', 'airMin', 'airMax', 'windAvg'] as SortKey[])('keeps missing %s values last in both directions', (key) => {
    const field = key === 'windAvg' ? 'windAverageKnots' : key
    const low = withForecast('Low', { [field]: 1 })
    const high = withForecast('High', { [field]: 9 })
    const nonFinite = withForecast('Not finite', { [field]: NaN })
    const otherDate = withForecast('Other date', { date: NEXT_DATE, [field]: 100 })
    const empty = { ...low, id: 'empty', name: 'Empty', daily: [] }
    const input = [nonFinite, otherDate, high, empty, low]
    expect(sortBeaches(input, { key, dir: 'asc' }, DATE, 'pt')).toEqual([low, high, empty, nonFinite, otherDate])
    expect(sortBeaches(input, { key, dir: 'desc' }, DATE, 'pt')).toEqual([high, low, empty, nonFinite, otherDate])
  })
})
