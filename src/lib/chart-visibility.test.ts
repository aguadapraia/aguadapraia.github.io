import { describe, expect, it } from 'vitest'
import {
  chartLineStatistics,
  chartLineReadings,
  chartReadingRange,
  DEFAULT_CHART_VISIBILITY,
  summarizeChartStatistic,
  visibleChartReadings,
  visibleChartStatistics,
  type ChartStatistic,
} from './chart-visibility'

const statistics: ChartStatistic[] = ['max', 'min', 'avg']
const readings = { min: 12, max: 25, avg: 18 }

describe('Chart series visibility', () => {
  it('keeps the primary line and min–max band by default', () => {
    expect(chartLineStatistics(DEFAULT_CHART_VISIBILITY, ['max', 'min'])).toEqual(['max'])
    expect(chartLineStatistics(DEFAULT_CHART_VISIBILITY, statistics)).toEqual(['avg'])
    expect(chartReadingRange(visibleChartReadings(readings, DEFAULT_CHART_VISIBILITY, statistics, 'history'))).toEqual([12, 25])
  })

  it.each(['min', 'max', 'avg'] as const)('removes hidden %s from data used by tooltips and summaries', (hidden) => {
    const visibility = { ...DEFAULT_CHART_VISIBILITY, [hidden]: false }
    const shown = visibleChartReadings(readings, visibility, statistics, 'history')
    expect(shown).not.toHaveProperty(hidden)
    expect(visibleChartStatistics(visibility, statistics)).not.toContain(hidden)
    if (hidden !== 'avg') expect(chartReadingRange(shown)).toBeUndefined()
  })

  it('shows the remaining extreme as a line instead of leaking the hidden extreme through a band', () => {
    expect(chartLineStatistics({ ...DEFAULT_CHART_VISIBILITY, max: false }, ['max', 'min'])).toEqual(['min'])
    expect(chartLineStatistics({ ...DEFAULT_CHART_VISIBILITY, min: false }, ['max', 'min'])).toEqual(['max'])
    expect(chartLineStatistics({ ...DEFAULT_CHART_VISIBILITY, avg: false }, statistics)).toEqual(['max'])
  })

  it('excludes forecast values even if their statistics are enabled', () => {
    const visibility = { ...DEFAULT_CHART_VISIBILITY, forecast: false }
    expect(visibleChartReadings(readings, visibility, statistics, 'forecast')).toEqual({})
    expect(visibleChartReadings(readings, visibility, statistics, 'history')).toEqual(readings)
  })

  it('does not invent temperature averages or turn missing values into zero', () => {
    expect(visibleChartReadings(readings, DEFAULT_CHART_VISIBILITY, ['max', 'min'], 'history')).toEqual({ max: 25, min: 12 })
    expect(visibleChartReadings({ min: NaN, max: Infinity, avg: 0 }, DEFAULT_CHART_VISIBILITY, statistics, 'history')).toEqual({ avg: 0 })
    expect(chartReadingRange({ max: 25 })).toBeUndefined()
  })

  it('supports an empty selection and a separate, truthful hourly series', () => {
    const visibility = { ...DEFAULT_CHART_VISIBILITY, min: false, max: false, avg: false }
    expect(visibleChartReadings(readings, visibility, statistics, 'history')).toEqual({})
    expect(chartLineStatistics(visibility, statistics)).toEqual([])
    expect(visibleChartReadings({ value: 15, min: 10 }, visibility, ['value'], 'history')).toEqual({ value: 15 })
    expect(visibleChartReadings({ value: 15 }, { ...visibility, value: false }, ['value'], 'history')).toEqual({})
  })

  it('summarizes daily minima rather than mislabelling the lowest daily maximum', () => {
    const daily = [
      { date: '2026-07-01', min: 10, max: 22, avg: 16 },
      { date: '2026-07-02', min: 12, max: 18, avg: 14 },
    ]
    expect(summarizeChartStatistic(daily, 'min')).toEqual({ count: 2, date: '2026-07-01', value: 10 })
    expect(summarizeChartStatistic(daily, 'max')).toEqual({ count: 2, date: '2026-07-01', value: 22 })
    expect(summarizeChartStatistic(daily, 'avg')).toEqual({ count: 2, value: 15 })
    expect(summarizeChartStatistic([{ date: '2026-07-01', max: 22 }], 'min')).toEqual({ count: 0 })
  })

  it('keeps isolated and partially missing extremes visible without reconnecting a band', () => {
    expect(chartLineReadings({ min: 10 }, ['max'], false)).toEqual({ min: 10 })
    expect(chartLineReadings({ min: 10, max: 20 }, ['max'], false)).toEqual({ min: 10, max: 20 })
    expect(chartLineReadings({ min: 10, max: 20 }, ['max'], true)).toEqual({ max: 20 })
    expect(chartLineReadings({ max: 20 }, ['max'], true)).toEqual({ max: 20 })
  })
})
