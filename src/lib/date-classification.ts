import type { DateKind } from '../types'

const calendarFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function lisbonDate(now = new Date()): string {
  const parts = calendarFormat.formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function preferredForecastDate(
  forecastDates: readonly string[],
  now = new Date(),
): string {
  const today = lisbonDate(now)
  return forecastDates.includes(today) ? today : (forecastDates[0] ?? '')
}

/** Classifies a published date against Portugal's current calendar date. */
export function classifyDate(
  date: string,
  forecastDates: readonly string[],
  now = new Date(),
): DateKind {
  if (forecastDates.length === 0) return 'history'
  const today = lisbonDate(now)
  if (date < today) return 'history'
  if (date === today) return 'current'
  return 'forecast'
}
