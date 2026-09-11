import type { DateKind } from '../types'
import { dateInTimeZone } from './time-zone'

export function lisbonDate(now = new Date()): string {
  return dateInTimeZone(now)
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
