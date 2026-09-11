import { getCopy, type Language } from '../i18n'
import { lisbonDate } from './date-classification'

interface RelativeLabel {
  relative: string
  compactDate: string
}

// Forecast dates are calendar labels, not instants in the visitor's timezone.
const compactDateFormats = {
  pt: new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
  en: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
}
const chartDateFormats: Partial<Record<Language, { short: Intl.DateTimeFormat; full: Intl.DateTimeFormat }>> = {}

export function formatCompactDate(date: string, language: Language) {
  return compactDateFormats[language].format(new Date(`${date}T12:00:00Z`))
}

export function formatChartDate(date: string, language: Language, year = false) {
  if (!date) return ''
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB'
  const formats = chartDateFormats[language] ??= {
    short: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    full: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  }
  return (year ? formats.full : formats.short).format(new Date(`${date}T12:00:00Z`))
}

function offsetDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function getRelativeLabel(
  date: string,
  forecastDates: readonly string[],
  language: Language,
  now = new Date(),
): RelativeLabel {
  const copy = getCopy(language)

  if (forecastDates.length === 0) {
    return {
      relative: copy.historical,
      compactDate: formatCompactDate(date, language),
    }
  }

  const today = lisbonDate(now)
  if (date === today) {
    return { relative: copy.today, compactDate: formatCompactDate(date, language) }
  }
  if (date === offsetDate(today, 1)) {
    return { relative: copy.tomorrow, compactDate: formatCompactDate(date, language) }
  }
  if (date === offsetDate(today, 2)) {
    return { relative: copy.dayThree, compactDate: formatCompactDate(date, language) }
  }
  if (date < today) {
    return { relative: copy.historical, compactDate: formatCompactDate(date, language) }
  }

  return { relative: copy.forecast, compactDate: formatCompactDate(date, language) }
}
