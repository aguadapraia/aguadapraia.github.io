import type { DailyBeachForecast, MapMetric } from '../types'
import { convertWind, type WindUnit } from './units'

export type MetricColourClass = 'cold' | 'cool' | 'warm' | 'hot' | 'very-hot'

export function windColourClass(knots: number): MetricColourClass {
  if (knots < 5) return 'cold'
  if (knots < 10) return 'cool'
  if (knots < 15) return 'warm'
  if (knots < 20) return 'hot'
  return 'very-hot'
}

export function mapMetricValue(
  forecast: DailyBeachForecast | undefined,
  metric: MapMetric,
): number {
  if (!forecast) return Number.NaN
  if (metric === 'air') return forecast.airMax
  if (metric === 'wind') return forecast.windAverageKnots
  return forecast.waterMax
}

export function isPreferredMetricValue(
  candidate: number,
  current: number,
  metric: MapMetric,
): boolean {
  if (!Number.isFinite(candidate)) return false
  if (!Number.isFinite(current)) return true
  return metric === 'wind' ? candidate < current : candidate > current
}

export function formatMapMetricValue(
  value: number,
  metric: MapMetric,
  windUnit: WindUnit,
): string {
  if (!Number.isFinite(value)) return '—'
  if (metric === 'wind') {
    return `${convertWind(value, windUnit).toFixed(1)} ${windUnit === 'kmh' ? 'km/h' : 'kn'}`
  }
  return `${value.toFixed(metric === 'air' ? 0 : 1)} °C`
}
