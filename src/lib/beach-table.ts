import type { BeachViewModel, DailyBeachForecast } from '../types'
import type { Language } from '../i18n'
import { normalizeBeachSearch } from './beach-search'

export type SortKey =
  | 'name'
  | 'district'
  | 'municipality'
  | 'waterMin'
  | 'waterMax'
  | 'airMin'
  | 'airMax'
  | 'windAvg'

type SortDir = 'asc' | 'desc'

export interface TableSortState {
  key: SortKey
  dir: SortDir
}

export interface TableFilterState {
  query: string
  district: string
  municipality: string
}

export function defaultSortState(): TableSortState {
  return { key: 'name', dir: 'asc' }
}

const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: 'asc',
  district: 'asc',
  municipality: 'asc',
  waterMin: 'asc',
  waterMax: 'desc',
  airMin: 'asc',
  airMax: 'desc',
  windAvg: 'asc',
}

const NUMERIC_FIELDS = {
  waterMin: 'waterMin',
  waterMax: 'waterMax',
  airMin: 'airMin',
  airMax: 'airMax',
  windAvg: 'windAverageKnots',
} as const

export function toggleSort(current: TableSortState, key: SortKey): TableSortState {
  if (current.key === key) {
    return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  }
  return { key, dir: DEFAULT_DIR[key] }
}

export function getTableForecast(beach: BeachViewModel, date: string): DailyBeachForecast | undefined {
  return beach.daily.find((forecast) => forecast.date === date)
}

export function hasTableValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function reconcileLocationFilters(
  beaches: BeachViewModel[],
  selected: Pick<TableFilterState, 'district' | 'municipality'>,
): Pick<TableFilterState, 'district' | 'municipality'> {
  const district = beaches.some((beach) => beach.district === selected.district) ? selected.district : ''
  const municipality = beaches.some((beach) =>
    (!district || beach.district === district) && beach.municipality === selected.municipality,
  ) ? selected.municipality : ''
  return { district, municipality }
}

export function filterBeaches(
  beaches: BeachViewModel[],
  filter: TableFilterState & { language: Language },
): BeachViewModel[] {
  const { query, district, municipality } = filter
  const normalized = normalizeBeachSearch(query)
  return beaches.filter((beach) => {
    if (district && beach.district !== district) return false
    if (municipality && beach.municipality !== municipality) return false
    if (normalized) {
      const hay = normalizeBeachSearch(`${beach.name} ${beach.district} ${beach.municipality}`)
      if (!hay.includes(normalized)) return false
    }
    return true
  })
}

export function sortBeaches(
  beaches: BeachViewModel[],
  sort: TableSortState,
  activeDate: string,
  language: Language,
): BeachViewModel[] {
  const m = sort.dir === 'asc' ? 1 : -1
  return [...beaches].sort((a, b) => {
    if (sort.key in NUMERIC_FIELDS) {
      const field = NUMERIC_FIELDS[sort.key as keyof typeof NUMERIC_FIELDS]
      const va = getTableForecast(a, activeDate)?.[field]
      const vb = getTableForecast(b, activeDate)?.[field]
      // Missing readings stay at the end, regardless of sort direction.
      if (!hasTableValue(va)) return hasTableValue(vb) ? 1 : a.name.localeCompare(b.name, language)
      if (!hasTableValue(vb)) return -1
      return (va - vb) * m || a.name.localeCompare(b.name, language)
    }
    let r: number
    switch (sort.key) {
      case 'district':
        r = a.district.localeCompare(b.district, language)
        if (r === 0) r = a.name.localeCompare(b.name, language)
        break
      case 'municipality':
        r = a.municipality.localeCompare(b.municipality, language)
        if (r === 0) r = a.name.localeCompare(b.name, language)
        break
      default: // 'name'
        r = a.name.localeCompare(b.name, language)
    }
    return r * m
  })
}
