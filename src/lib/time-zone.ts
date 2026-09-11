import type { Language } from '../i18n'
import type { ForecastTimeZone, Territory } from '../types'

export const DEFAULT_TIME_ZONE: ForecastTimeZone = 'Europe/Lisbon'
const BEACH_TIME_ZONES: Record<Territory, ForecastTimeZone> = {
  mainland: DEFAULT_TIME_ZONE,
  madeira: 'Atlantic/Madeira',
  azores: 'Atlantic/Azores',
}
type Instant = string | number | Date
const formats = new Map<string, Intl.DateTimeFormat>()

function timestamp(value: Instant): Date {
  if (typeof value === 'string' && !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(`Timestamp must include its UTC offset: ${value}`)
  }
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid timestamp: ${value}`)
  return date
}

function formatter(kind: 'date' | 'clock' | 'offset', timeZone: string): Intl.DateTimeFormat {
  const key = `${kind}|${timeZone}`
  const cached = formats.get(key)
  if (cached) return cached
  const options: Intl.DateTimeFormatOptions = kind === 'date'
    ? { year: 'numeric', month: '2-digit', day: '2-digit' }
    : kind === 'clock'
      ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
      : { timeZoneName: 'shortOffset' }
  const value = new Intl.DateTimeFormat('en-GB', { ...options, timeZone })
  formats.set(key, value)
  if (formats.size > 32) formats.delete(formats.keys().next().value!)
  return value
}

export function timeZoneForBeach(territory: Territory): ForecastTimeZone {
  return BEACH_TIME_ZONES[territory]
}

export function dateInTimeZone(value: Instant, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parts = formatter('date', timeZone).formatToParts(timestamp(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => {
    const result = parts.find((item) => item.type === type)?.value
    if (!result) throw new Error(`Unable to format ${type} in ${timeZone}`)
    return result
  }
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function formatClock(value: Instant, timeZone: string = DEFAULT_TIME_ZONE): string {
  return formatter('clock', timeZone).format(timestamp(value))
}

function offsetLabel(value: Instant, timeZone: string): string {
  const name = formatter('offset', timeZone).formatToParts(timestamp(value))
    .find((part) => part.type === 'timeZoneName')?.value
  const match = name?.match(/^(?:GMT|UTC)(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/)
  if (!match) throw new Error(`Unable to format UTC offset in ${timeZone}`)
  if (!match[1]) return '+0'
  const minutes = Number(match[3] ?? 0)
  return `${match[1]}${Number(match[2])}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`
}

export function timeZoneRangeLabel(
  instants: readonly Instant[],
  timeZone: string = DEFAULT_TIME_ZONE,
  language: Language = 'pt',
): string {
  if (instants.length === 0) throw new Error('A timezone label needs at least one instant')
  const offsets = [...new Set(instants.map((instant) => offsetLabel(instant, timeZone)))]
  const label = timeZone === 'Europe/Lisbon' || timeZone === 'Atlantic/Madeira' ? 'PT'
    : timeZone === 'Atlantic/Azores' ? language === 'pt' ? 'Açores' : 'Azores' : timeZone
  return `${label} (UTC${offsets.join('/')})`
}

export function timeZoneLabel(
  instant: Instant,
  timeZone: string = DEFAULT_TIME_ZONE,
  language: Language = 'pt',
): string {
  return timeZoneRangeLabel([instant], timeZone, language)
}

export function utcHourInstant(date: string, hour: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`Invalid UTC forecast hour: ${date}/${hour}`)
  }
  const instant = `${date}T${String(hour).padStart(2, '0')}:00:00Z`
  const parsed = timestamp(instant)
  if (parsed.toISOString().slice(0, 10) !== date) throw new Error(`Invalid forecast date: ${date}`)
  return instant
}
