export type Territory = 'mainland' | 'madeira' | 'azores'
export type TerritoryFilter = 'all' | Territory
export type Theme = 'light' | 'dark'
export type SettingsMapMetric = 'water' | 'air' | 'wind'
export type MapMetric = SettingsMapMetric
export type DateKind = 'history' | 'current' | 'forecast'

export interface HistoryPoint {
  date: string
  label: string
  kind: DateKind
  waterMin?: number
  waterMax?: number
  airMin?: number
  airMax?: number
  windMinKnots?: number
  windAverageKnots?: number
  windMaxKnots?: number
}

export interface HourlyBeachReading {
  hour: number
  airTemperatureCelsius?: number | null
  waterTemperatureCelsius: number | null
  windKnots: number | null
  windDirection: string | null
}

export interface BeachDayAir {
  minimumCelsius: number
  maximumCelsius: number
}

export interface BeachDaySummary {
  waterMinCelsius: number | null
  waterMaxCelsius: number | null
  daytimeWindMinKnots: number | null
  daytimeWindAverageKnots: number | null
  daytimeWindMaxKnots: number | null
}

export interface BeachDayDetail {
  schemaVersion: number
  beachId: string
  date: string
  updatedAt: string
  air: BeachDayAir | null
  summary: BeachDaySummary | null
  hourly: HourlyBeachReading[]
  hourlyTimeZone?: 'UTC'
}

export type ForecastTimeZone = 'Europe/Lisbon' | 'Atlantic/Madeira' | 'Atlantic/Azores'

export interface BeachTideForecast {
  schemaVersion: 1
  beachId: string
  date: string
  timeZone: ForecastTimeZone
  status: 'available' | 'stale' | 'unsupported' | 'unavailable'
  reference: {
    portId: string
    name: string
    distanceKm: number
    approximate: true
  } | null
  source: {
    name: 'Instituto Hidrográfico'
    url: 'https://www.hidrografico.pt/'
  }
  events: {
    timeUtc: string
    kind: 'low' | 'high'
    heightMeters: number
  }[]
  updatedAt: string | null
  reason?: 'no-reference' | 'not-collected' | 'missing-day' | 'source-error'
}

export interface DailyBeachForecast {
  date: string
  waterMin: number
  waterMax: number
  waterMinHour: number | null
  waterMaxHour: number | null
  windMinKnots: number
  windMaxKnots: number
  windMinHour: number | null
  windMaxHour: number | null
  windAverageKnots: number
  windAt13Knots: number
  airMin: number
  airMax: number
  airMinHour: number | null
  airMaxHour: number | null
  airLocation: string
  airDistanceKm: number
}

export interface DistrictWeatherForecast {
  locationId: number
  locationName: string
  latitude: number
  longitude: number
  date: string
  minimumCelsius: number
  maximumCelsius: number
  weatherTypeId: number
}

export interface BeachViewModel {
  id: string
  name: string
  territory: Territory
  district: string
  municipality: string
  latitude: number
  longitude: number
  sourceLatitude: number
  sourceLongitude: number
  daily: DailyBeachForecast[]
  history: HistoryPoint[]
}

export interface TerritoryAggregate {
  date: string
  kind: DateKind
  water: { min: number; avg: number; max: number; coverage: number } | null
  air: { min: number; avg: number; max: number; coverage: number } | null
  wind: { min: number; avg: number; max: number; coverage: number } | null
}

interface UnavailableLocation {
  id: string
  name: string
}

export interface BeachDataset {
  generatedAt: string
  forecastUpdatedAt: string
  catalogSize: number
  availableCount: number
  forecastDates: string[]
  historyDates: string[]
  beaches: BeachViewModel[]
  districtWeather: DistrictWeatherForecast[]
  unavailableLocations: UnavailableLocation[]
}
