import { describe, expect, it } from 'vitest'
import {
  availableEvolutionDates,
  calendarDayCount,
  evolutionPeriodBounds,
  evolutionRequestChunks,
  isCalendarDate,
  resolveEvolutionPeriod,
} from './evolution-period'

describe('Evolution calendar periods', () => {
  it('uses the last available day rather than today and counts calendar days inclusively', () => {
    expect(evolutionPeriodBounds('30d', '2026-08-02')).toEqual({ start: '2026-07-04', end: '2026-08-02' })
    expect(evolutionPeriodBounds('7d', '2026-01-03')).toEqual({ start: '2025-12-28', end: '2026-01-03' })
    expect(evolutionPeriodBounds('day', '2026-07-01')).toEqual({ start: '2026-07-01', end: '2026-07-01' })
  })

  it('resolves real month and leap-year boundaries', () => {
    expect(evolutionPeriodBounds('month', '2024-02-09')).toEqual({ start: '2024-02-01', end: '2024-02-29' })
    expect(evolutionPeriodBounds('month', '2026-02-09')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(evolutionPeriodBounds('month', '2026-12-31')).toEqual({ start: '2026-12-01', end: '2026-12-31' })
    expect(evolutionPeriodBounds('year', '2024-06-01')).toEqual({ start: '2024-01-01', end: '2024-12-31' })
    expect(calendarDayCount('2024-01-01', '2024-12-31')).toBe(366)
    expect(calendarDayCount('2026-03-28', '2026-03-30')).toBe(3)
  })

  it('rejects invalid and reversed ranges', () => {
    for (const value of ['2026-02-29', '2024-02-30', '2026-13-01', '2026-7-01', '', 'not-a-date']) {
      expect(isCalendarDate(value)).toBe(false)
      expect(evolutionPeriodBounds('month', value)).toBeNull()
    }
    expect(resolveEvolutionPeriod('2026-08-01', '2026-07-01', ['2026-07-01'])).toBeNull()
    expect(resolveEvolutionPeriod('2025-01-01', '2026-12-31', ['2026-07-01'])?.dates).toEqual(['2026-07-01'])
  })

  it('resolves a Monday-to-Sunday week across years', () => {
    expect(evolutionPeriodBounds('week', '2026-01-01')).toEqual({ start: '2025-12-29', end: '2026-01-04' })
    expect(evolutionPeriodBounds('week', '2026-01-04')).toEqual({ start: '2025-12-29', end: '2026-01-04' })
  })

  it('keeps the full archive and splits requests without overlaps or lost days', () => {
    const result = resolveEvolutionPeriod('2024-01-01', '2026-01-01', ['2024-01-01', '2026-01-01'])
    expect(result?.calendarDates).toHaveLength(732)
    expect(result?.clipped).toBe(false)
    expect(evolutionRequestChunks('2024-01-01', '2026-01-01')).toEqual([
      { start: '2024-01-01', end: '2024-12-31' },
      { start: '2025-01-01', end: '2026-01-01' },
    ])
    expect(evolutionRequestChunks('2024-01-01', '2026-01-02').at(-1)).toEqual({
      start: '2026-01-02', end: '2026-01-02',
    })
    expect(evolutionRequestChunks('2026-07-01', '2026-07-01')).toEqual([
      { start: '2026-07-01', end: '2026-07-01' },
    ])
    expect(evolutionRequestChunks('invalid', '2026-07-01')).toEqual([])
    expect(evolutionRequestChunks('2026-07-02', '2026-07-01')).toEqual([])
  })

  it('clips a year to the real July archive without inventing earlier observations', () => {
    const result = resolveEvolutionPeriod('2026-01-01', '2026-12-31', ['2026-07-01', '2026-07-02'])
    expect(result).toMatchObject({
      requestedStart: '2026-01-01',
      requestedEnd: '2026-12-31',
      start: '2026-07-01',
      end: '2026-07-02',
      dates: ['2026-07-01', '2026-07-02'],
      clipped: true,
      missingDays: 0,
    })
  })

  it('preserves internal missing calendar days and does not replace a missing day with a neighbour', () => {
    const result = resolveEvolutionPeriod('2026-07-01', '2026-07-03', ['2026-07-01', '2026-07-03'])
    expect(result?.calendarDates).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
    expect(result?.dates).toEqual(['2026-07-01', '2026-07-03'])
    expect(result?.missingDays).toBe(1)
    const gap = resolveEvolutionPeriod('2026-07-02', '2026-07-02', ['2026-07-01', '2026-07-03'])
    expect(gap?.dates).toEqual([])
    expect(gap?.missingDays).toBe(1)
    expect(gap?.start).toBe('2026-07-02')
  })

  it('handles empty archives, non-overlap and index duplicates safely', () => {
    expect(resolveEvolutionPeriod('2026-07-01', '2026-07-31', [])).toBeNull()
    expect(resolveEvolutionPeriod('2025-07-01', '2025-07-31', ['2026-07-01'])).toBeNull()
    expect(availableEvolutionDates(['2026-07-03', 'invalid', '2026-07-01', '2026-07-03']))
      .toEqual(['2026-07-01', '2026-07-03'])
  })
})
