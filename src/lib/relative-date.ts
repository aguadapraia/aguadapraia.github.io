import { getCopy, type Language } from '../i18n'
import { lisbonDate } from './date-classification'

interface RelativeLabel {
  relative: string
  compactDate: string
}

export function formatCompactDate(date: string, language: Language) {
  return new Intl.DateTimeFormat(language === 'pt' ? 'pt-PT' : 'en-GB', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${date}T12:00:00Z`))
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
