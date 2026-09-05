import type {
  BeachDataset,
  BeachDayAir,
  BeachDayDetail,
  BeachDaySummary,
  BeachViewModel,
  DailyBeachForecast,
  DistrictWeatherForecast,
  HistoryPoint,
  HourlyBeachReading,
  Territory,
  TerritoryAggregate,
  TerritoryFilter,
} from '../types'
import { z } from 'zod'
import { classifyDate } from '../lib/date-classification'
import { canonicalBeachName } from '../lib/beach-name'
import { publicAssetUrl } from '../lib/public-asset'
import { HIGHLIGHT_SIMILARITY } from '../lib/highlight-policy'

function dataUrl(
  subpath: string,
  apiBase: string | undefined = import.meta.env.VITE_DATA_API_BASE as string | undefined,
): string {
  const localApiBase =
    apiBase ??
    (typeof window !== 'undefined' &&
    (window.location.hostname === '127.0.0.1' ||
      window.location.hostname === 'localhost')
      ? '/api/data'
      : undefined)
  if (localApiBase) {
    const base = localApiBase.endsWith('/')
      ? localApiBase.slice(0, -1)
      : localApiBase
    return `${base}/${subpath.replace(/\.json(?=$|\?)/, '')}`
  }
  throw new Error('The public data API is not configured')
}

interface RawBeach {
  id: string
  name: string
  latitude: number
  longitude: number
}

interface RawSummary {
  beachId: string
  forecastDate: string
  waterMinCelsius: number | null
  waterMinHour: number | null
  waterMaxCelsius: number | null
  waterMaxHour: number | null
  daytimeWindMinKnots: number | null
  daytimeWindMinHour: number | null
  daytimeWindMaxKnots: number | null
  daytimeWindMaxHour: number | null
  daytimeWindAverageKnots: number | null
  windAt13Knots: number | null
}

interface RawAirTemperature {
  locationId: number
  beachId: string
  forecastDate: string
  locationName: string
  weatherMatchType?:
    | 'exact-beach'
    | 'exact-location'
    | 'nearby-beach'
    | 'municipality'
    | 'fallback'
  physicalDistanceKm?: number
  distanceKm: number
  minimumCelsius: number
  maximumCelsius: number
  minimumHourUtc?: number | null
  maximumHourUtc?: number | null
  locationLatitude: number
  locationLongitude: number
  weatherTypeId: number
}

interface RawDistrictWeather {
  locationId: number
  locationName: string
  latitude: number
  longitude: number
  forecastDate: string
  minimumCelsius: number
  maximumCelsius: number
  weatherTypeId: number
}

interface RawPayload {
  schemaVersion?: number
  generatedAt: string
  forecastUpdatedAt?: string
  displayForecastDates?: string[]
  catalogSize: number
  availableBeachCount: number
  unavailableLocations: {
    beach: { id: string; name: string }
  }[]
  beaches: RawBeach[]
  summaries: RawSummary[]
  airTemperatures: RawAirTemperature[]
  districtWeather?: RawDistrictWeather[]
}

interface BeachMetadata {
  id: string
  name: string
  territory: Territory
  district: string
  municipality: string
  sourceLatitude: number
  sourceLongitude: number
  displayLatitude: number
  displayLongitude: number
}

export interface TimelinePoint {
  beachId: string
  date: string
  waterMin?: number
  waterMax?: number
  airMin?: number
  airMax?: number
  windMinKnots?: number
  windAverageKnots?: number
  windMaxKnots?: number
}

export interface TimelineIndexData {
  schemaVersion: number
  dates: string[]
  generatedAt: string
}

export interface EvolutionSummaryData {
  schemaVersion: number
  start: string
  end: string
  dates: string[]
  aggregates: Array<Omit<TerritoryAggregate, 'kind'>>
  records?: HistoricalRecords
  recordCandidates?: HistoricalRecords
  generatedAt: string
}

export interface HistoricalRecord {
  beachId: string
  date: string
  value: number
}

export type HistoricalRecords = Record<'water' | 'air' | 'wind', {
  min: HistoricalRecord[]
  max: HistoricalRecord[]
}>

export interface EvolutionDateData {
  schemaVersion: number
  date: string
  points: TimelinePoint[]
  generatedAt: string
}

export interface EvolutionBeachHistoriesData {
  schemaVersion: number
  start: string
  end: string
  histories: Array<{
    beachId: string
    points: TimelinePoint[]
  }>
  generatedAt: string
}

interface DayDetailCacheEntry {
  promise: Promise<BeachDayDetail>
  expiresAt: number
}

const rawBeachSchema: z.ZodType<RawBeach> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
})

const rawSummarySchema: z.ZodType<RawSummary> = z.object({
  beachId: z.string().min(1),
  forecastDate: z.string().date(),
  waterMinCelsius: z.number().nullable(),
  waterMinHour: z.number().int().min(0).max(23).nullable(),
  waterMaxCelsius: z.number().nullable(),
  waterMaxHour: z.number().int().min(0).max(23).nullable(),
  daytimeWindMinKnots: z.number().nullable(),
  daytimeWindMinHour: z.number().int().min(0).max(23).nullable(),
  daytimeWindMaxKnots: z.number().nullable(),
  daytimeWindMaxHour: z.number().int().min(0).max(23).nullable(),
  daytimeWindAverageKnots: z.number().nullable(),
  windAt13Knots: z.number().nullable(),
})

const rawAirTemperatureSchema: z.ZodType<RawAirTemperature> = z.object({
  locationId: z.number().int(),
  beachId: z.string().min(1),
  forecastDate: z.string().date(),
  locationName: z.string().min(1),
  weatherMatchType: z
    .enum([
      'exact-beach',
      'exact-location',
      'nearby-beach',
      'municipality',
      'fallback',
    ])
    .optional(),
  physicalDistanceKm: z.number().nonnegative().optional(),
  distanceKm: z.number().nonnegative(),
  minimumCelsius: z.number(),
  maximumCelsius: z.number(),
  minimumHourUtc: z.number().int().min(0).max(23).nullable().optional(),
  maximumHourUtc: z.number().int().min(0).max(23).nullable().optional(),
  locationLatitude: z.number(),
  locationLongitude: z.number(),
  weatherTypeId: z.number().int(),
})

const rawDistrictWeatherSchema: z.ZodType<RawDistrictWeather> = z.object({
  locationId: z.number().int(),
  locationName: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  forecastDate: z.string().date(),
  minimumCelsius: z.number(),
  maximumCelsius: z.number(),
  weatherTypeId: z.number().int(),
})

const rawPayloadSchema: z.ZodType<RawPayload> = z.object({
  schemaVersion: z.number().int().optional(),
  generatedAt: z.string().datetime({ offset: true }),
  forecastUpdatedAt: z.string().datetime({ offset: true }).optional(),
  displayForecastDates: z.array(z.string().date()).min(1).optional(),
  catalogSize: z.number().int().nonnegative(),
  availableBeachCount: z.number().int().nonnegative(),
  unavailableLocations: z.array(
    z.object({
      beach: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
      }),
    }),
  ),
  beaches: z.array(rawBeachSchema),
  summaries: z.array(rawSummarySchema),
  airTemperatures: z.array(rawAirTemperatureSchema),
  districtWeather: z.array(rawDistrictWeatherSchema).optional(),
})

const beachMetadataSchema: z.ZodType<BeachMetadata> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  territory: z.enum(['mainland', 'madeira', 'azores']),
  district: z.string().min(1),
  municipality: z.string().min(1),
  sourceLatitude: z.number(),
  sourceLongitude: z.number(),
  displayLatitude: z.number(),
  displayLongitude: z.number(),
})

const timelinePointSchema: z.ZodType<TimelinePoint> = z.object({
  beachId: z.string().min(1),
  date: z.string().date(),
  waterMin: z.number().optional(),
  waterMax: z.number().optional(),
  airMin: z.number().optional(),
  airMax: z.number().optional(),
  windMinKnots: z.number().optional(),
  windAverageKnots: z.number().optional(),
  windMaxKnots: z.number().optional(),
})

const timelineIndexSchema: z.ZodType<TimelineIndexData> = z.object({
  schemaVersion: z.number().int(),
  dates: z.array(z.string().date()),
  generatedAt: z.string().datetime({ offset: true }),
})

const metricAggregateSchema = z.object({
  min: z.number(),
  avg: z.number(),
  max: z.number(),
  coverage: z.number().min(0).max(1),
})

const evolutionAggregateSchema = z.object({
  date: z.string().date(),
  water: metricAggregateSchema.nullable(),
  air: metricAggregateSchema.nullable(),
  wind: metricAggregateSchema.nullable(),
})

const historicalRecordSchema: z.ZodType<HistoricalRecord> = z.object({
  beachId: z.string().min(1),
  date: z.string().date(),
  value: z.number(),
})
const historicalMetricRecordsSchema = z.object({
  min: z.array(historicalRecordSchema).max(2),
  max: z.array(historicalRecordSchema).max(2),
})
const historicalRecordsSchema: z.ZodType<HistoricalRecords> = z.object({
  water: historicalMetricRecordsSchema,
  air: historicalMetricRecordsSchema,
  wind: historicalMetricRecordsSchema,
})
const historicalCandidateMetricSchema = z.object({
  min: z.array(historicalRecordSchema).max(512),
  max: z.array(historicalRecordSchema).max(512),
})
const historicalCandidatesSchema: z.ZodType<HistoricalRecords> = z.object({
  water: historicalCandidateMetricSchema,
  air: historicalCandidateMetricSchema,
  wind: historicalCandidateMetricSchema,
})

const evolutionSummarySchema: z.ZodType<EvolutionSummaryData> = z.object({
  schemaVersion: z.number().int(),
  start: z.string().date(),
  end: z.string().date(),
  dates: z.array(z.string().date()),
  aggregates: z.array(evolutionAggregateSchema),
  records: historicalRecordsSchema.optional(),
  recordCandidates: historicalCandidatesSchema.optional(),
  generatedAt: z.string().datetime({ offset: true }),
})

const evolutionDateSchema: z.ZodType<EvolutionDateData> = z.object({
  schemaVersion: z.number().int(),
  date: z.string().date(),
  points: z.array(timelinePointSchema),
  generatedAt: z.string().datetime({ offset: true }),
})

const evolutionBeachHistoriesSchema: z.ZodType<EvolutionBeachHistoriesData> =
  z.object({
    schemaVersion: z.number().int(),
    start: z.string().date(),
    end: z.string().date(),
    histories: z.array(
      z.object({
        beachId: z.string().min(1),
        points: z.array(timelinePointSchema),
      }),
    ),
  generatedAt: z.string().datetime({ offset: true }),
  })


const hourlyReadingSchema: z.ZodType<HourlyBeachReading> = z.object({
  hour: z.number().int().min(0).max(23),
  airTemperatureCelsius: z.number().nullable().default(null),
  waterTemperatureCelsius: z.number().nullable(),
  windKnots: z.number().nullable(),
  windDirection: z.string().min(1).nullable(),
})

const beachDayAirSchema: z.ZodType<BeachDayAir> = z.object({
  minimumCelsius: z.number(),
  maximumCelsius: z.number(),
})

const beachDaySummarySchema: z.ZodType<BeachDaySummary> = z.object({
  waterMinCelsius: z.number().nullable(),
  waterMaxCelsius: z.number().nullable(),
  daytimeWindMinKnots: z.number().nullable(),
  daytimeWindAverageKnots: z.number().nullable(),
  daytimeWindMaxKnots: z.number().nullable(),
})

const beachDayDetailSchema: z.ZodType<BeachDayDetail> = z.object({
  schemaVersion: z.number().int(),
  beachId: z.string().min(1),
  date: z.string().date(),
  updatedAt: z.string().datetime({ offset: true }),
  air: beachDayAirSchema.nullable(),
  summary: beachDaySummarySchema.nullable(),
  hourly: z.array(hourlyReadingSchema),
  hourlyTimeZone: z.literal('UTC').optional(),
})

const dayDetailCache = new Map<string, DayDetailCacheEntry>()
const CURRENT_DAY_DETAIL_CACHE_MS = 60_000
let timelineIndexCache:
  | { promise: Promise<TimelineIndexData>; expiresAt: number }
  | undefined

function lisbonCalendarDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${date}T12:00:00Z`))
}

function requiredNumber(value: number | null, context: string) {
  if (value === null || !Number.isFinite(value)) {
    throw new Error(`Published beach data is missing ${context}`)
  }
  return value
}

function historyPointFromDaily(
  forecast: DailyBeachForecast,
  forecastDates: readonly string[],
): HistoryPoint {
  return {
    date: forecast.date,
    label: dateLabel(forecast.date),
    kind: classifyDate(forecast.date, forecastDates),
    waterMin: forecast.waterMin,
    waterMax: forecast.waterMax,
    airMin: forecast.airMin,
    airMax: forecast.airMax,
    windMinKnots: forecast.windMinKnots,
    windAverageKnots: forecast.windAverageKnots,
    windMaxKnots: forecast.windMaxKnots,
  }
}

export function historyPointFromTimeline(
  point: TimelinePoint,
  forecastDates: readonly string[],
): HistoryPoint {
  return {
    date: point.date,
    label: dateLabel(point.date),
    kind: classifyDate(point.date, forecastDates),
    ...(point.waterMin === undefined ? {} : { waterMin: point.waterMin }),
    ...(point.waterMax === undefined ? {} : { waterMax: point.waterMax }),
    ...(point.airMin === undefined ? {} : { airMin: point.airMin }),
    ...(point.airMax === undefined ? {} : { airMax: point.airMax }),
    ...(point.windMinKnots === undefined ? {} : { windMinKnots: point.windMinKnots }),
    ...(point.windAverageKnots === undefined
      ? {}
      : { windAverageKnots: point.windAverageKnots }),
    ...(point.windMaxKnots === undefined ? {} : { windMaxKnots: point.windMaxKnots }),
  }
}

function createDailyForecast(
  beachId: string,
  date: string,
  summaries: Map<string, RawSummary>,
  airTemperatures: Map<string, RawAirTemperature>,
): DailyBeachForecast {
  const key = `${beachId}|${date}`
  const summary = summaries.get(key)
  const air = airTemperatures.get(key)
  if (!summary || !air) {
    throw new Error(`Published beach data is incomplete for ${key}`)
  }

  const windMin = requiredNumber(summary.daytimeWindMinKnots, `${key} wind minimum`)
  const windMax = requiredNumber(summary.daytimeWindMaxKnots, `${key} wind maximum`)

  return {
    date,
    waterMin: requiredNumber(summary.waterMinCelsius, `${key} water minimum`),
    waterMax: requiredNumber(summary.waterMaxCelsius, `${key} water maximum`),
    waterMinHour: summary.waterMinHour,
    waterMaxHour: summary.waterMaxHour,
    windMinKnots: windMin,
    windMaxKnots: windMax,
    windMinHour: summary.daytimeWindMinHour,
    windMaxHour: summary.daytimeWindMaxHour,
    windAverageKnots: requiredNumber(
      summary.daytimeWindAverageKnots,
      `${key} wind average`,
    ),
    windAt13Knots: summary.windAt13Knots ?? (windMin + windMax) / 2,
    airMin: air.minimumCelsius,
    airMax: air.maximumCelsius,
    airMinHour: air.minimumHourUtc ?? null,
    airMaxHour: air.maximumHourUtc ?? null,
    airLocation: air.locationName,
    airDistanceKm: air.distanceKm,
  }
}

function districtWeatherFromPayload(payload: RawPayload): DistrictWeatherForecast[] {
  return (payload.districtWeather ?? []).map(
    (weather): DistrictWeatherForecast => ({
      locationId: weather.locationId,
      locationName: weather.locationName,
      latitude: weather.latitude,
      longitude: weather.longitude,
      date: weather.forecastDate,
      minimumCelsius: weather.minimumCelsius,
      maximumCelsius: weather.maximumCelsius,
      weatherTypeId: weather.weatherTypeId,
    }),
  )
}

function buildBeaches(
  payload: RawPayload,
  metadata: BeachMetadata[],
): BeachViewModel[] {
  const metadataById = new Map(metadata.map((item) => [item.id, item]))
  const summaries = new Map(
    payload.summaries.map((summary) => [
      `${summary.beachId}|${summary.forecastDate}`,
      summary,
    ]),
  )
  const airTemperatures = new Map(
    payload.airTemperatures.map((air) => [
      `${air.beachId}|${air.forecastDate}`,
      air,
    ]),
  )
  const forecastDates =
    payload.displayForecastDates ??
    [...new Set(payload.airTemperatures.map((air) => air.forecastDate))]
      .sort()
      .slice(0, 3)

  return payload.beaches.map((beach) => {
    const location = metadataById.get(beach.id)
    if (!location) throw new Error(`Missing administrative metadata for ${beach.id}`)

    const daily = forecastDates.map((date) =>
      createDailyForecast(beach.id, date, summaries, airTemperatures),
    )
    const history = daily.map((forecast) => historyPointFromDaily(forecast, forecastDates))

    return {
      ...beach,
      name: canonicalBeachName(location.name, location.municipality),
      sourceLatitude: location.sourceLatitude,
      sourceLongitude: location.sourceLongitude,
      latitude: location.displayLatitude,
      longitude: location.displayLongitude,
      territory: location.territory,
      district: location.district,
      municipality: location.municipality,
      daily,
      history,
    }
  })
}

function forecastDatesFromPayload(payload: RawPayload): string[] {
  const forecastDates =
    payload.displayForecastDates ??
    [...new Set(payload.airTemperatures.map((air) => air.forecastDate))]
      .sort()
      .slice(0, 3)
  if (forecastDates.length === 0) {
    throw new Error('Published data has no forecast dates')
  }
  return forecastDates
}

export async function loadTimelineIndex(): Promise<TimelineIndexData> {
  if (timelineIndexCache && timelineIndexCache.expiresAt > Date.now()) {
    return timelineIndexCache.promise
  }
  const promise = (async () => {
    const response = await fetch(dataUrl('evolution/index.json'), {
      cache: 'default',
    })
    if (!response.ok) {
      throw new Error('Published timeline index is unavailable')
    }
    return timelineIndexSchema.parse(await response.json())
  })()
  const entry = { promise, expiresAt: Date.now() + 60_000 }
  timelineIndexCache = entry
  promise.catch(() => {
    if (timelineIndexCache === entry) timelineIndexCache = undefined
  })
  return promise
}

export function resetEvolutionIndexCache(): void {
  timelineIndexCache = undefined
}

export async function loadEvolutionSummary(
  start: string,
  end: string,
  territory: TerritoryFilter,
  signal?: AbortSignal,
  includeCandidates = false,
): Promise<EvolutionSummaryData> {
  const query = new URLSearchParams({
    start, end, territory, records: includeCandidates ? '2' : '1',
    temperatureTolerance: String(HIGHLIGHT_SIMILARITY.temperatureCelsius),
    windToleranceKnots: String(HIGHLIGHT_SIMILARITY.windKnots),
  })
  const response = await fetch(
    dataUrl(`evolution/summary.json?${query.toString()}`),
    { cache: 'default', signal },
  )
  if (!response.ok) {
    throw new Error(`Evolution summary unavailable (${response.status})`)
  }
  return evolutionSummarySchema.parse(await response.json())
}

export async function loadEvolutionDate(
  date: string,
  territory: TerritoryFilter,
  signal?: AbortSignal,
): Promise<EvolutionDateData> {
  const query = new URLSearchParams({ territory })
  const response = await fetch(
    dataUrl(`evolution/date/${date}.json?${query.toString()}`),
    { cache: 'default', signal },
  )
  if (!response.ok) {
    throw new Error(`Evolution date unavailable (${response.status})`)
  }
  return evolutionDateSchema.parse(await response.json())
}

export async function loadEvolutionBeachHistories(
  beachIds: readonly string[],
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<EvolutionBeachHistoriesData> {
  const query = new URLSearchParams({
    ids: beachIds.join(','),
    start,
    end,
  })
  const response = await fetch(
    dataUrl(`evolution/beaches.json?${query.toString()}`),
    { cache: 'default', signal },
  )
  if (!response.ok) {
    throw new Error(`Evolution beach histories unavailable (${response.status})`)
  }
  return evolutionBeachHistoriesSchema.parse(await response.json())
}


export function resetDayDetailCache(): void {
  dayDetailCache.clear()
}

export async function loadBeachDayDetail(
  beachId: string,
  date: string,
): Promise<BeachDayDetail> {
  const key = `${beachId}/${date}`
  const cached = dayDetailCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  if (cached) dayDetailCache.delete(key)

  const subpath = `beach/${encodeURIComponent(beachId)}/day/${date}.json`
  const request = (async () => {
    const response = await fetch(dataUrl(subpath), { cache: 'default' })
    if (!response.ok) {
      throw new Error(`Beach day detail unavailable: ${beachId}/${date} (${response.status})`)
    }
    return beachDayDetailSchema.parse(await response.json())
  })()

  const entry = {
    promise: request,
    expiresAt:
      date < lisbonCalendarDate()
        ? Number.POSITIVE_INFINITY
        : Date.now() + CURRENT_DAY_DETAIL_CACHE_MS,
  }
  dayDetailCache.set(key, entry)
  request.catch(() => {
    if (dayDetailCache.get(key) === entry) {
      dayDetailCache.delete(key)
    }
  })
  return request
}

export async function loadBeachDataset(): Promise<BeachDataset> {
  const [latestResponse, metadataResponse] = await Promise.all([
    fetch(dataUrl('latest.json'), { cache: 'default' }),
    fetch(publicAssetUrl('data/beach-metadata.json'), { cache: 'no-cache' }),
  ])
  if (!latestResponse.ok || !metadataResponse.ok) {
    throw new Error('Published beach data is unavailable')
  }

  const payload = rawPayloadSchema.parse(await latestResponse.json())
  const metadata = z.array(beachMetadataSchema).parse(await metadataResponse.json())
  const forecastDates = forecastDatesFromPayload(payload)

  return {
    generatedAt: payload.generatedAt,
    forecastUpdatedAt: payload.forecastUpdatedAt ?? payload.generatedAt,
    catalogSize: payload.catalogSize,
    availableCount: payload.availableBeachCount,
    forecastDates,
    historyDates: [],
    beaches: buildBeaches(payload, metadata),
    districtWeather: districtWeatherFromPayload(payload),
    unavailableLocations: payload.unavailableLocations.map(({ beach }) => beach),
  }
}
