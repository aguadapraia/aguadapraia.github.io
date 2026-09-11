import { dateInTimeZone, DEFAULT_TIME_ZONE, formatClock } from './time-zone'

export function formatFreshnessTimestamp(
  generatedAt: string,
  timeZone: string = DEFAULT_TIME_ZONE,
  compact = false,
): string {
  const date = dateInTimeZone(generatedAt, timeZone)
  const hour = formatClock(generatedAt, timeZone).slice(0, 2)
  return `${compact ? `${date.slice(8)}/${date.slice(5, 7)}` : date} ${hour}H`
}
