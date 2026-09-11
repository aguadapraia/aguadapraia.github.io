import type {
  BeachDataset,
  BeachDayAir,
  BeachDayDetail,
  BeachDaySummary,
  BeachTideForecast,
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
import { classifyDate, lisbonDate } from '../lib/date-classification'
import { canonicalBeachName } from '../lib/beach-name'
import { publicAssetUrl } from '../lib/public-asset'
import { HIGHLIGHT_SIMILARITY } from '../lib/highlight-policy'
import { RequestCache } from '../lib/request-cache'
import { availableHistoryDates, calendarDayCount, historyRequestChunks, resolveHistoryPeriod } from '../lib/history-period'
import { formatCompactDate } from '../lib/relative-date'
import { dateInTimeZone } from '../lib/time-zone'

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
  weatherMatchType?: DailyBeachForecast['airMatchType']
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

export interface HistorySummaryData {
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

export interface HistoryDateData {
  schemaVersion: number
  date: string
  points: TimelinePoint[]
  generatedAt: string
}

export interface HistoryBeachHistoriesData {
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

const historyAggregateSchema = z.object({
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

const historySummarySchema: z.ZodType<HistorySummaryData> = z.object({
  schemaVersion: z.number().int(),
  start: z.string().date(),
  end: z.string().date(),
  dates: z.array(z.string().date()),
  aggregates: z.array(historyAggregateSchema),
  records: historicalRecordsSchema.optional(),
  recordCandidates: historicalCandidatesSchema.optional(),
  generatedAt: z.string().datetime({ offset: true }),
})

const historyDateSchema: z.ZodType<HistoryDateData> = z.object({
  schemaVersion: z.number().int(),
  date: z.string().date(),
  points: z.array(timelinePointSchema),
  generatedAt: z.string().datetime({ offset: true }),
})

const historyBeachHistoriesSchema: z.ZodType<HistoryBeachHistoriesData> =
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

const beachTideForecastSchema: z.ZodType<BeachTideForecast> = z.object({
  schemaVersion: z.literal(1),
  beachId: z.string().regex(/^\d+$/),
  date: z.string().date(),
  timeZone: z.enum(['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores']),
  status: z.enum(['available', 'stale', 'unsupported', 'unavailable']),
  reference: z.object({
    portId: z.string().regex(/^\d+$/),
    name: z.string().min(1),
    distanceKm: z.number().min(0).max(60),
    approximate: z.literal(true),
  }).nullable(),
  source: z.object({
    name: z.literal('Instituto Hidrográfico'),
    url: z.literal('https://www.hidrografico.pt/'),
  }),
  events: z.array(z.object({
    timeUtc: z.string().datetime(),
    kind: z.enum(['low', 'high']),
    heightMeters: z.number().min(-5).max(15),
  })).max(5),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
  reason: z.enum(['no-reference', 'not-collected', 'missing-day', 'source-error']).optional(),
}).superRefine((forecast, context) => {
  const hasForecast = forecast.status === 'available' || forecast.status === 'stale'
  if (hasForecast && (!forecast.reference || !forecast.updatedAt || forecast.events.length < 3)) {
    context.addIssue({ code: 'custom', message: 'Tide forecast is incomplete' })
  }
  if (!hasForecast && (forecast.events.length !== 0 || forecast.updatedAt !== null)) {
    context.addIssue({ code: 'custom', message: 'Unavailable tide forecast contains events' })
  }
  if (forecast.status === 'unsupported' && forecast.reference !== null) {
    context.addIssue({ code: 'custom', message: 'Unsupported tide forecast contains a reference' })
  }
  if ((forecast.status === 'available' && forecast.reason !== undefined) ||
      (forecast.status === 'stale' && forecast.reason !== 'source-error' && forecast.reason !== 'missing-day') ||
      (forecast.status === 'unsupported' && forecast.reason !== 'no-reference') ||
      (forecast.status === 'unavailable' && forecast.reason !== 'not-collected' && forecast.reason !== 'missing-day' && forecast.reason !== 'source-error')) {
    context.addIssue({ code: 'custom', message: 'Tide status and reason are inconsistent' })
  }
  forecast.events.forEach((event, index) => {
    if (!Number.isFinite(Date.parse(event.timeUtc))) return
    if (dateInTimeZone(event.timeUtc, forecast.timeZone) !== forecast.date) {
      context.addIssue({ code: 'custom', message: 'Tide event falls outside the selected local date' })
    }
    if (index > 0) {
      const previous = forecast.events[index - 1]
      const hours = (Date.parse(event.timeUtc) - Date.parse(previous.timeUtc)) / 3_600_000
      if (hours < 4 || hours > 9 || previous.kind === event.kind ||
          (previous.kind === 'high' ? previous.heightMeters <= event.heightMeters : previous.heightMeters >= event.heightMeters)) {
        context.addIssue({ code: 'custom', message: 'Tide extrema must alternate with consistent times and heights' })
      }
    }
  })
})

const dayDetailCache = new Map<string, DayDetailCacheEntry>()
const CURRENT_DAY_DETAIL_CACHE_MS = 60_000
const timelineIndexCache = new RequestCache<TimelineIndexData>(1)
const historySummaryCache = new RequestCache<HistorySummaryData>()
const historyDateCache = new RequestCache<HistoryDateData>()
const historyBeachCache = new RequestCache<HistoryBeachHistoriesData>()
const beachTideCache = new RequestCache<BeachTideForecast>()

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
    label: formatCompactDate(forecast.date, 'pt'),
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
    label: formatCompactDate(point.date, 'pt'),
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
    airMatchType: air.weatherMatchType,
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

export function loadTimelineIndex(signal?: AbortSignal): Promise<TimelineIndexData> {
  return timelineIndexCache.get('index', async (requestSignal) => {
    const response = await fetch(dataUrl('historico/index.json'), {
      cache: 'default', signal: requestSignal,
    })
    if (!response.ok) {
      throw new Error('Published timeline index is unavailable')
    }
    return timelineIndexSchema.parse(await response.json())
  }, signal)
}

function historySummaryQuery(start: string, end: string, territory: TerritoryFilter, includeCandidates: boolean) {
  return new URLSearchParams({
    start, end, territory, records: includeCandidates ? '2' : '1',
    temperatureTolerance: String(HIGHLIGHT_SIMILARITY.temperatureCelsius),
    windToleranceKnots: String(HIGHLIGHT_SIMILARITY.windKnots),
  }).toString()
}

export function getPreparedHistory(territory: TerritoryFilter) {
  const index = timelineIndexCache.peek('index')
  if (!index) return undefined
  const today = lisbonDate()
  const dates = availableHistoryDates(index.dates.filter((date) => date < today))
  const start = dates[0] ?? ''
  const end = dates.at(-1) ?? ''
  const period = resolveHistoryPeriod(start, end, dates)
  const map = period ? historyDateCache.peek(`${end}|${territory}`) : undefined
  return {
    index,
    period,
    summary: period && calendarDayCount(start, end) <= 366
      ? historySummaryCache.peek(historySummaryQuery(start, end, territory, false))
      : undefined,
    map: map?.date === end ? map : undefined,
  }
}

export async function loadHistorySummary(
  start: string,
  end: string,
  territory: TerritoryFilter,
  signal?: AbortSignal,
  includeCandidates = false,
): Promise<HistorySummaryData> {
  const query = historySummaryQuery(start, end, territory, includeCandidates)
  return historySummaryCache.get(query, async (requestSignal) => {
    const response = await fetch(
      dataUrl(`historico/summary.json?${query}`),
      { cache: 'default', signal: requestSignal },
    )
    if (!response.ok) throw new Error(`History summary unavailable (${response.status})`)
    return historySummarySchema.parse(await response.json())
  }, signal)
}

export async function loadHistoryDate(
  date: string,
  territory: TerritoryFilter,
  signal?: AbortSignal,
): Promise<HistoryDateData> {
  const query = new URLSearchParams({ territory })
  return historyDateCache.get(`${date}|${territory}`, async (requestSignal) => {
    const response = await fetch(
      dataUrl(`historico/date/${date}.json?${query.toString()}`),
      { cache: 'default', signal: requestSignal },
    )
    if (!response.ok) throw new Error(`History date unavailable (${response.status})`)
    return historyDateSchema.parse(await response.json())
  }, signal)
}

export async function loadHistoryBeachHistories(
  beachIds: readonly string[],
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<HistoryBeachHistoriesData> {
  const query = new URLSearchParams({
    ids: beachIds.join(','),
    start,
    end,
  })
  return historyBeachCache.get(query.toString(), async (requestSignal) => {
    const response = await fetch(
      dataUrl(`historico/beaches.json?${query.toString()}`),
      { cache: 'default', signal: requestSignal },
    )
    if (!response.ok) throw new Error(`History beach histories unavailable (${response.status})`)
    return historyBeachHistoriesSchema.parse(await response.json())
  }, signal)
}

export async function prepareHistory(territory: TerritoryFilter, signal: AbortSignal): Promise<void> {
  const index = await loadTimelineIndex(signal)
  const today = lisbonDate()
  const dates = availableHistoryDates(index.dates.filter((date) => date < today))
  const start = dates[0]
  const end = dates.at(-1)
  if (!start || !end) return
  const chunks = historyRequestChunks(start, end)
  // Prepare a bounded overview, not every beach or the entire growing archive.
  const first = chunks[0]
  await loadHistorySummary(first.start, first.end, territory, signal, chunks.length > 1)
  await loadHistoryDate(end, territory, signal)
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
    const detail = beachDayDetailSchema.parse(await response.json())
    if (detail.beachId !== beachId || detail.date !== date) {
      throw new Error('Hourly forecast does not match the selected beach and date')
    }
    return detail
  })()

  const entry = {
    promise: request,
    expiresAt:
      date < lisbonDate()
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

export async function loadBeachTideForecast(
  beachId: string,
  date: string,
  signal?: AbortSignal,
): Promise<BeachTideForecast> {
  const key = `${beachId}/${date}`
  return beachTideCache.get(key, async (requestSignal) => {
    const response = await fetch(dataUrl(`beach/${encodeURIComponent(beachId)}/tides/${encodeURIComponent(date)}`), {
      cache: 'default', signal: requestSignal,
    })
    if (!response.ok) throw new Error(`Tide forecast unavailable: ${key} (${response.status})`)
    const forecast = beachTideForecastSchema.parse(await response.json())
    if (forecast.beachId !== beachId || forecast.date !== date) {
      throw new Error('Tide forecast does not match the selected beach and date')
    }
    return forecast
  }, signal)
}

export async function loadBeachDataset(): Promise<BeachDataset> {
  const signal = AbortSignal.timeout(30_000)
  const [latestResponse, metadataResponse] = await Promise.all([
    fetch(dataUrl('latest.json'), { cache: 'default', signal }),
    fetch(publicAssetUrl('data/beach-metadata.json'), { cache: 'no-cache', signal }),
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
