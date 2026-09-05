import type { HourlyBeachReading } from '../types'

export function daytimeReadings(
  readings: readonly HourlyBeachReading[],
): HourlyBeachReading[] {
  return readings.filter((reading) => reading.hour >= 8 && reading.hour <= 18)
}

export function hasHourlyAir(readings: readonly HourlyBeachReading[]): boolean {
  return daytimeReadings(readings).some((reading) =>
    typeof reading.airTemperatureCelsius === 'number' && Number.isFinite(reading.airTemperatureCelsius))
}
