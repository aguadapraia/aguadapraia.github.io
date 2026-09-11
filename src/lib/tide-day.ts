import type { Language } from '../i18n'
import type { BeachTideForecast } from '../types'
import { localDaytimeWindow } from './daytime-hours'
import { formatClock } from './time-zone'

export function describeTideDay(forecast: BeachTideForecast, language: Language) {
  const window = localDaytimeWindow(forecast.date, forecast.timeZone, language)
  const start = Date.parse(window.slots[0].instant)
  const end = Date.parse(window.slots.at(-1)!.instant)
  const events = forecast.events.map((event) => {
    const timestamp = Date.parse(event.timeUtc)
    return { ...event, timestamp, label: formatClock(timestamp, forecast.timeZone), inDaytime: timestamp >= start && timestamp <= end }
  })
  const daytimeEvents = events.filter((event) => event.inDaytime)
  const boundaries = [start, ...daytimeEvents.map((event) => event.timestamp).filter((time) => time > start && time < end), end]
  const periods = boundaries.slice(0, -1).map((from, index) => {
    const to = boundaries[index + 1]
    const middle = from + (to - from) / 2
    const nextIndex = events.findIndex((event) => event.timestamp > middle)
    const previous = nextIndex > 0 ? events[nextIndex - 1] : undefined
    const next = nextIndex > 0 ? events[nextIndex] : undefined
    // Do not extrapolate beyond the extrema actually supplied for this date.
    const direction = previous && next && previous.kind !== next.kind
      ? previous.kind === 'low' ? 'rising' : 'falling'
      : 'unknown'
    return { start: from, end: to, startLabel: formatClock(from, forecast.timeZone), endLabel: formatClock(to, forecast.timeZone), direction }
  })
  return { events, daytimeEvents, periods, start, end, range: window.range }
}

export type TideDay = ReturnType<typeof describeTideDay>
