import type { HourlyBeachReading } from '../types'
import type { Language } from '../i18n'
import { dateInTimeZone, formatClock, timeZoneRangeLabel, utcHourInstant } from './time-zone'

export function localDaytimeWindow(date: string, timeZone: string, language: Language = 'pt') {
  const slots = Array.from({ length: 24 }, (_, hour) => {
    const instant = utcHourInstant(date, hour)
    return { hour, instant, label: formatClock(instant, timeZone) }
  }).filter((slot) => slot.label >= '08:00' && slot.label <= '18:00' &&
    dateInTimeZone(slot.instant, timeZone) === date)
  if (slots.length === 0) throw new Error(`No daytime UTC slots for ${date} in ${timeZone}`)
  const first = slots[0], last = slots.at(-1)!
  return {
    slots,
    range: '08–18h',
    zoneLabel: timeZoneRangeLabel([first.instant, last.instant], timeZone, language),
  }
}

export function daytimeReadings(
  readings: readonly HourlyBeachReading[],
  window: ReturnType<typeof localDaytimeWindow>,
): HourlyBeachReading[] {
  const hours = new Set(window.slots.map((slot) => slot.hour))
  return readings.filter((reading) => hours.has(reading.hour))
}

export function hasHourlyAir(readings: readonly HourlyBeachReading[]): boolean {
  return readings.some((reading) =>
    typeof reading.airTemperatureCelsius === 'number' && Number.isFinite(reading.airTemperatureCelsius))
}
