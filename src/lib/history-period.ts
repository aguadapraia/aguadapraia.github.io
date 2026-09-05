export type HistoryPeriodPreset = 'all' | 'week' | '7d' | '30d' | 'month' | 'year' | 'custom' | 'day'

export interface HistoryPeriod {
  requestedStart: string
  requestedEnd: string
  start: string
  end: string
  dates: string[]
  calendarDates: string[]
  missingDays: number
  clipped: boolean
}

const DAY_MS = 86_400_000
/** Maximum calendar days accepted by one public history request. */
export const MAX_HISTORY_DAYS = 366

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

export function availableHistoryDates(dates: readonly string[]): string[] {
  return [...new Set(dates.filter(isCalendarDate))].sort()
}

export function calendarDayCount(start: string, end: string): number {
  if (!isCalendarDate(start) || !isCalendarDate(end) || start > end) return 0
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1
}

export function historyPeriodBounds(
  preset: Exclude<HistoryPeriodPreset, 'custom' | 'all'>,
  anchor: string,
): { start: string; end: string } | null {
  if (!isCalendarDate(anchor)) return null
  if (preset === 'day') return { start: anchor, end: anchor }
  if (preset === 'week') {
    const date = new Date(`${anchor}T00:00:00Z`)
    const monday = date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY_MS
    return {
      start: new Date(monday).toISOString().slice(0, 10),
      end: new Date(monday + 6 * DAY_MS).toISOString().slice(0, 10),
    }
  }
  if (preset === 'year') return { start: `${anchor.slice(0, 4)}-01-01`, end: `${anchor.slice(0, 4)}-12-31` }
  if (preset === 'month') {
    const monthEnd = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`)
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0)
    const lastDay = monthEnd.getUTCDate()
    return { start: `${anchor.slice(0, 7)}-01`, end: `${anchor.slice(0, 7)}-${lastDay}` }
  }
  const count = preset === '7d' ? 7 : 30
  return {
    start: new Date(Date.parse(`${anchor}T00:00:00Z`) - (count - 1) * DAY_MS).toISOString().slice(0, 10),
    end: anchor,
  }
}

/** The 366-day limit applies to requests, not to the available archive. */
export function historyRequestChunks(start: string, end: string): { start: string; end: string }[] {
  const days = calendarDayCount(start, end)
  if (!days) return []
  const first = Date.parse(`${start}T00:00:00Z`)
  return Array.from({ length: Math.ceil(days / MAX_HISTORY_DAYS) }, (_, index) => ({
    start: new Date(first + index * MAX_HISTORY_DAYS * DAY_MS).toISOString().slice(0, 10),
    end: new Date(first + (Math.min((index + 1) * MAX_HISTORY_DAYS, days) - 1) * DAY_MS).toISOString().slice(0, 10),
  }))
}

/** Clip the requested calendar, not its observations: internal gaps remain visible. */
export function resolveHistoryPeriod(
  start: string,
  end: string,
  availableDates: readonly string[],
): HistoryPeriod | null {
  const requestedDays = calendarDayCount(start, end)
  if (!requestedDays) return null
  const available = availableHistoryDates(availableDates)
  const first = available[0]
  const last = available[available.length - 1]
  if (!first || !last || end < first || start > last) return null
  const clippedStart = start < first ? first : start
  const clippedEnd = end > last ? last : end
  const dates = available.filter((date) => date >= clippedStart && date <= clippedEnd)
  const calendarDates = Array.from(
    { length: calendarDayCount(clippedStart, clippedEnd) },
    (_, index) => new Date(Date.parse(`${clippedStart}T00:00:00Z`) + index * DAY_MS).toISOString().slice(0, 10),
  )
  return {
    requestedStart: start,
    requestedEnd: end,
    start: clippedStart,
    end: clippedEnd,
    dates,
    calendarDates,
    missingDays: calendarDates.length - dates.length,
    clipped: start !== clippedStart || end !== clippedEnd,
  }
}
