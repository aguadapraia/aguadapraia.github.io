export type ChartStatistic = 'max' | 'min' | 'avg' | 'value'
export type ChartVisibilityKey = ChartStatistic | 'forecast'
export type ChartVisibility = Record<ChartVisibilityKey, boolean>
export type ChartReadings = Partial<Record<ChartStatistic, number>>

export const DEFAULT_CHART_VISIBILITY: ChartVisibility = {
  max: true, min: true, avg: true, value: true, forecast: true,
}

export function visibleChartStatistics(
  visibility: ChartVisibility,
  statistics: readonly ChartStatistic[],
): ChartStatistic[] {
  return statistics.filter((statistic) => visibility[statistic])
}

/** Use the same projection for curves, domains, summaries and tooltip values. */
export function visibleChartReadings(
  readings: ChartReadings,
  visibility: ChartVisibility,
  statistics: readonly ChartStatistic[],
  kind: 'history' | 'forecast',
): ChartReadings {
  if (kind === 'forecast' && !visibility.forecast) return {}
  return Object.fromEntries(visibleChartStatistics(visibility, statistics)
    .filter((statistic) => Number.isFinite(readings[statistic]))
    .map((statistic) => [statistic, readings[statistic]]))
}

export function chartReadingRange(readings: ChartReadings): [number, number] | undefined {
  return readings.min !== undefined && readings.max !== undefined && Number.isFinite(readings.min) && Number.isFinite(readings.max)
    ? [readings.min, readings.max]
    : undefined
}

/** Both extremes form a band; an extreme left on its own becomes a line. */
export function chartLineStatistics(
  visibility: ChartVisibility,
  statistics: readonly ChartStatistic[],
): ChartStatistic[] {
  const enabled = visibleChartStatistics(visibility, statistics)
  const band = enabled.includes('min') && enabled.includes('max')
  return enabled.filter((statistic) => {
    if (statistic === 'min') return !band
    if (statistic === 'max') return !band || !enabled.includes('avg')
    return true
  })
}

/** A missing or isolated band must not swallow its surviving extreme. */
export function chartLineReadings(
  readings: ChartReadings,
  primaryStatistics: readonly ChartStatistic[],
  hasAdjacentRange: boolean,
): ChartReadings {
  const values = visibleChartReadings(readings, DEFAULT_CHART_VISIBILITY, ['max', 'min', 'avg', 'value'], 'history')
  if (!chartReadingRange(values) || !hasAdjacentRange) return values
  return Object.fromEntries(primaryStatistics
    .filter((statistic) => values[statistic] !== undefined)
    .map((statistic) => [statistic, values[statistic]]))
}

export function summarizeChartStatistic(
  readings: readonly (ChartReadings & { date: string })[],
  statistic: ChartStatistic,
): { count: number; value?: number; date?: string } {
  const values = readings.flatMap((reading) => {
    const value = reading[statistic]
    return value !== undefined && Number.isFinite(value) ? [{ date: reading.date, value }] : []
  })
  if (!values.length) return { count: 0 }
  if (statistic === 'avg' || statistic === 'value') {
    return { count: values.length, value: values.reduce((total, reading) => total + reading.value, 0) / values.length }
  }
  const extreme = values.reduce((best, reading) =>
    (statistic === 'min' ? reading.value < best.value : reading.value > best.value) ? reading : best)
  return { count: values.length, ...extreme }
}
