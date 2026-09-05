import { historyRequestChunks } from './history-period'
import type { HistoricalRecord, HistoricalRecords } from '../data/api'
import type { BeachViewModel, HistoryPoint, MapMetric } from '../types'
import { selectDiverseHighlights } from './highlight-policy'

function rankHistoricalRecords(
  records: readonly HistoricalRecord[], direction: 'min' | 'max', metric: MapMetric,
  beaches: ReadonlyMap<string, BeachViewModel>,
): HistoricalRecord[] {
  const sorted = [...records].filter((record) => Number.isFinite(record.value)).sort((a, b) =>
    (direction === 'min' ? a.value - b.value : b.value - a.value) ||
    a.date.localeCompare(b.date) || a.beachId.localeCompare(b.beachId))
  const seen = new Set<string>()
  const distinct = sorted.filter((record) => {
    if (seen.has(record.beachId)) return false
    seen.add(record.beachId)
    return true
  }).map((record) => {
    const beach = beaches.get(record.beachId)
    if (!beach) throw new Error(`Historical record has no catalog location: ${record.beachId}`)
    return { ...record, beach }
  })
  return selectDiverseHighlights(distinct, metric).map(({ beachId, date, value }) => ({ beachId, date, value }))
}

export function mergeHistoricalRecords(
  chunks: readonly (HistoricalRecords | undefined)[], catalog: readonly BeachViewModel[],
): HistoricalRecords | undefined {
  if (!chunks.length || chunks.some((chunk) => !chunk)) return undefined
  const beaches = new Map(catalog.map((beach) => [beach.id, beach]))
  const merge = (metric: keyof HistoricalRecords) => ({
    min: rankHistoricalRecords(chunks.flatMap((chunk) => chunk?.[metric].min ?? []), 'min', metric, beaches),
    max: rankHistoricalRecords(chunks.flatMap((chunk) => chunk?.[metric].max ?? []), 'max', metric, beaches),
  })
  return { water: merge('water'), air: merge('air'), wind: merge('wind') }
}

export function recordsFromHistories(histories: ReadonlyMap<string, HistoryPoint[]>, start: string, end: string, catalog: readonly BeachViewModel[]): HistoricalRecords {
  const beaches = new Map(catalog.map((beach) => [beach.id, beach]))
  const readings = [...histories].flatMap(([beachId, points]) =>
    points.filter((point) => point.date >= start && point.date <= end).map((point) => ({ beachId, point })))
  const rank = (field: 'waterMin' | 'waterMax' | 'airMin' | 'airMax' | 'windMinKnots' | 'windMaxKnots', direction: 'min' | 'max', metric: MapMetric) =>
    rankHistoricalRecords(readings.flatMap(({ beachId, point }) => {
      const value = point[field]
      return value === undefined ? [] : [{ beachId, date: point.date, value }]
    }), direction, metric, beaches)
  return {
    water: { min: rank('waterMin', 'min', 'water'), max: rank('waterMax', 'max', 'water') },
    air: { min: rank('airMin', 'min', 'air'), max: rank('airMax', 'max', 'air') },
    wind: { min: rank('windMinKnots', 'min', 'wind'), max: rank('windMaxKnots', 'max', 'wind') },
  }
}

/** Complete one bounded public request at a time; successful chunks survive a retry. */
export async function loadBoundedHistory<T>({
  start, end, signal, cache, cacheKey, load,
}: {
  start: string
  end: string
  signal: AbortSignal
  cache: Map<string, T>
  cacheKey: string
  load: (start: string, end: string, signal: AbortSignal) => Promise<T>
}): Promise<T[]> {
  const chunks = historyRequestChunks(start, end)
  if (!chunks.length) throw new RangeError('Invalid history period')
  const values: T[] = []
  for (const chunk of chunks) {
    signal.throwIfAborted()
    const key = `${cacheKey}|${chunk.start}|${chunk.end}`
    let value = cache.get(key)
    if (value === undefined) {
      value = await load(chunk.start, chunk.end, signal)
      signal.throwIfAborted()
      cache.set(key, value)
      if (cache.size > 24) cache.delete(cache.keys().next().value!)
    }
    values.push(value)
  }
  signal.throwIfAborted()
  return values
}
