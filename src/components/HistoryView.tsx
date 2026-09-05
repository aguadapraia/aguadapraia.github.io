import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, ArrowUp, CalendarDays, ChevronDown, Droplets, Search, ThermometerSun, X, Wind } from 'lucide-react'
import {
  historyPointFromTimeline,
  loadBeachDayDetail,
  loadHistoryBeachHistories,
  loadHistoryDate,
  loadHistorySummary,
  loadTimelineIndex,
  type HistoricalRecords,
  type TimelinePoint,
} from '../data/api'
import { getCopy, type Language } from '../i18n'
import { beachColor } from '../lib/beach-palette'
import { uniqueShortBeachName } from '../lib/beach-name'
import { normalizeBeachSearch } from '../lib/beach-search'
import { HIGHLIGHT_SIMILARITY } from '../lib/highlight-policy'
import { lisbonDate } from '../lib/date-classification'
import { daytimeReadings, hasHourlyAir } from '../lib/daytime-hours'
import {
  chartLineReadings, chartLineStatistics, chartReadingRange, DEFAULT_CHART_VISIBILITY,
  summarizeChartStatistic, visibleChartReadings, visibleChartStatistics, type ChartReadings, type ChartStatistic,
} from '../lib/chart-visibility'
import { loadBoundedHistory, mergeHistoricalRecords, recordsFromHistories } from '../lib/history-data'
import {
  availableHistoryDates,
  calendarDayCount,
  historyPeriodBounds,
  resolveHistoryPeriod,
  type HistoryPeriod,
} from '../lib/history-period'
import { convertWind, type WindUnit } from '../lib/units'
import { windDirectionDegrees } from '../lib/wind-direction'
import type { BeachDataset, BeachDayDetail, BeachViewModel, HistoryPoint, MapMetric, SettingsMapMetric, TerritoryAggregate, TerritoryFilter, Theme } from '../types'
import LoadingIndicator from './LoadingIndicator'
import ChartSeriesLegend from './ChartSeriesLegend'
import MapLegend from './MapLegend'
import TerritorySelect from './TerritorySelect'
import './history.css'

const PortugalMap = lazy(() => import('./PortugalMap'))

const text = {
  pt: {
    beaches: 'Praias', metric: 'Indicador',
    period: 'Período', all: 'Tudo', week: 'Semana',
    month: 'Mês', custom: 'Intervalo', day: 'Dia',
    from: 'De', to: 'Até', apply: 'Ver período', chooseBeach: 'Procurar praias para comparar',
    addBeach: 'Adicionar praia', noMatches: 'Nenhuma praia encontrada.',
    maxBeaches: 'Quatro praias selecionadas. Remove uma para adicionar outra.',
    archive: 'Histórico', forecasts: 'Previsões guardadas',
    archiveNote: 'Previsões guardadas de dias anteriores, não medições.',
    noArchive: 'Ainda não há dias de arquivo disponíveis.',
    indexError: 'Não foi possível confirmar a disponibilidade do arquivo.',
    periodError: 'Escolhe datas válidas, com o início anterior ou igual ao fim.',
    outsideArchive: 'Não existem dados publicados neste período.',
    clipped: 'Limitado ao arquivo disponível.',
    gap: 'dias sem publicação',
    coverage: 'dias com dados', days: 'dias', of: 'de',
    territoryReading: 'A linha mostra a média entre praias; a faixa mostra o mínimo e o máximo diários.',
    hourlyKey: '08:00–18:00 · valores horários',
    temperatureReading: 'A média territorial usa os pontos médios entre os mínimos e máximos de cada praia.',
    beachReading: 'Uma cor por praia. Mínimos e máximos diários; para o vento, também a média diurna.',
    hourlyReading: 'Valores horários publicados, das 08:00 às 18:00. As horas sem dados ficam em branco.',
    airDaily: 'Ar: mín. e máx. diárias; sem valores horários.',
    periodSummary: 'Resumo das séries visíveis', minimum: 'Mín.', maximum: 'Máx.', average: 'Média',
    territorySummary: 'Extremos de todas as praias da região. Média dos valores diários da linha.',
    beachSummary: 'Menor mínimo e maior máximo das previsões diárias. No vento, média das médias diurnas. Apenas séries visíveis.',
    noData: 'Sem dados para estas séries.', hiddenSeries: 'Ativa uma série na legenda.',
    map: 'Mapa', mapHint: 'Gráfico: escolhe o dia. Mapa: compara praias.',
    mapDate: 'Dia no mapa', viewDay: 'Detalhe do dia', mapEmpty: 'Sem valores para este dia e indicador.',
    recordDay: 'Ver este dia no mapa',
    recordBeach: 'Ver praia e dia no mapa', recordLocations: 'Extremos por praia',
    highest: 'Máximos', lowest: 'Mínimos', recordsUnavailable: 'Extremos por praia indisponíveis.',
    hourly: 'Valores por hora', time: 'Hora', water: 'Água', air: 'Ar', wind: 'Vento',
    windDirection: 'Direção do vento', loading: 'A carregar o período…', retry: 'Tentar novamente',
    windDirectionNote: 'A direção indica de onde vem o vento; as setas mostram para onde sopra.',
    loadError: 'Não foi possível carregar estes dados. Tenta novamente.',
    partialError: 'Não foi possível carregar todas as praias. Os valores em falta não são estimados.',
    remove: 'Remover', chart: 'Histórico das previsões no período selecionado',
    dayKindArchive: 'Previsão guardada',
    territoryAverage: 'Média da região', compareHint: 'Até 4 praias · sem seleção, média da região',
    pickDate: 'Escolher dia / intervalo', close: 'Fechar calendário',
    rangeHint: 'Tudo inclui o arquivo completo. Semana e mês são períodos de calendário.',
    fullArchive: 'Histórico completo',
    legendHelp: 'As opções aplicam-se a todas as praias. A faixa só aparece com Mín. e Máx. ativos. As falhas ficam em branco, sem interpolação.',
  },
  en: {
    beaches: 'Beaches', metric: 'Metric',
    period: 'Period', all: 'All', week: 'Week',
    month: 'Month', custom: 'Range', day: 'Day',
    from: 'From', to: 'To', apply: 'View period', chooseBeach: 'Find beaches to compare',
    addBeach: 'Add a beach', noMatches: 'No beaches found.',
    maxBeaches: 'Four beaches selected. Remove one to add another.',
    archive: 'History', forecasts: 'Saved forecasts',
    archiveNote: 'Saved forecasts for past dates, not measurements.',
    noArchive: 'No archive days are available yet.',
    indexError: 'Archive availability could not be confirmed.',
    periodError: 'Choose valid dates, with the start on or before the end.',
    outsideArchive: 'No published data is available in this period.',
    clipped: 'Limited to the available archive.',
    gap: 'days without a publication',
    coverage: 'days with data', days: 'days', of: 'of',
    territoryReading: 'The line shows the average across beaches; the band shows the daily minimum and maximum.',
    hourlyKey: '08:00–18:00 · hourly values',
    temperatureReading: 'The territory average uses the midpoint of each beach’s minimum and maximum.',
    beachReading: 'One colour per beach. Daily minimum and maximum; wind also has a daytime average.',
    hourlyReading: 'Published hourly values, 08:00–18:00. Hours without data are left blank.',
    airDaily: 'Air: daily min and max only; no hourly values.',
    periodSummary: 'Summary of visible series', minimum: 'Min.', maximum: 'Max.', average: 'Average',
    territorySummary: 'Extremes across all beaches in the region. Average of the daily line values.',
    beachSummary: 'Lowest daily minimum and highest daily maximum. For wind, the average of daytime averages. Visible series only.',
    noData: 'No data for these series.', hiddenSeries: 'Enable a series in the legend.',
    map: 'Map', mapHint: 'Chart: choose a day. Map: compare beaches.',
    mapDate: 'Map day', viewDay: 'Day detail', mapEmpty: 'No values for this day and metric.',
    recordDay: 'Show this day on the map',
    recordBeach: 'Show beach and date on the map', recordLocations: 'Beach extremes',
    highest: 'Highest', lowest: 'Lowest', recordsUnavailable: 'Beach extremes are unavailable.',
    hourly: 'Hourly values', time: 'Time', water: 'Water', air: 'Air', wind: 'Wind',
    windDirection: 'Wind direction', loading: 'Loading this period…', retry: 'Try again',
    windDirectionNote: 'Direction indicates where the wind comes from; arrows show where it blows.',
    loadError: 'These data could not be loaded. Please try again.',
    partialError: 'Some beaches could not be loaded. Missing values are not estimated.',
    remove: 'Remove', chart: 'Forecast history during the selected period',
    dayKindArchive: 'Saved forecast',
    territoryAverage: 'Region average', compareHint: 'Up to 4 beaches · none selected shows the region average',
    pickDate: 'Choose day / range', close: 'Close calendar',
    rangeHint: 'All includes the full archive. Week and month are calendar periods.',
    fullArchive: 'Full history',
    legendHelp: 'Options apply to all beaches. The band requires both Min. and Max. Missing values stay blank, without interpolation.',
  },
} as const

interface HistoryViewProps {
  dataset: BeachDataset
  language: Language
  windUnit: WindUnit
  theme: Theme
  initialTerritory: TerritoryFilter
  initialMapMetric: SettingsMapMetric
  initialBeachId?: string
  onReturn: () => void
  returnLabel: string
}

type Aggregate = Omit<TerritoryAggregate, 'kind'>
interface ArchiveSummary { values: Aggregate[]; records?: HistoricalRecords; recordCandidates?: HistoricalRecords }
type ChartPoint = { date: string; [key: string]: string | number | number[] | undefined }
type ViewPeriodPreset = 'all' | 'month' | 'week' | 'day' | 'custom'
interface Series { key: string; name: string; color: string }
interface Summary { id: string; name: string; color: string; values: ({ date: string } & ChartReadings)[] }

function formatDate(date: string, language: Language, year = false) {
  if (!date) return ''
  return new Intl.DateTimeFormat(language === 'pt' ? 'pt-PT' : 'en-GB', {
    day: 'numeric', month: 'short', ...(year ? { year: 'numeric' as const } : {}),
  }).format(new Date(`${date}T12:00:00Z`))
}

function finite(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function metricValue(point: HistoryPoint | undefined, metric: MapMetric): number | undefined {
  return finite(metric === 'water' ? point?.waterMax : metric === 'air' ? point?.airMax : point?.windAverageKnots)
}

function mapBeach(beach: BeachViewModel, point: TimelinePoint): BeachViewModel {
  return {
    ...beach,
    daily: [{
      date: point.date, waterMin: point.waterMin ?? NaN, waterMax: point.waterMax ?? NaN,
      waterMinHour: null, waterMaxHour: null, airMin: point.airMin ?? NaN, airMax: point.airMax ?? NaN,
      airMinHour: null, airMaxHour: null, airLocation: '', airDistanceKm: 0,
      windMinKnots: point.windMinKnots ?? NaN, windMaxKnots: point.windMaxKnots ?? NaN,
      windAverageKnots: point.windAverageKnots ?? NaN, windAt13Knots: point.windAverageKnots ?? NaN,
      windMinHour: null, windMaxHour: null,
    }],
  }
}

function retainCache<T>(cache: Map<string, T>, key: string, value: T) {
  cache.set(key, value)
  if (cache.size > 24) cache.delete(cache.keys().next().value!)
}

export default function HistoryView({
  dataset, language, windUnit, theme, initialTerritory,
  initialMapMetric, initialBeachId, onReturn, returnLabel,
}: HistoryViewProps) {
  const copy = getCopy(language)
  const t = text[language]
  const today = lisbonDate()
  const [metric, setMetric] = useState<MapMetric>(initialMapMetric)
  const [territory, onTerritoryChange] = useState(initialTerritory)
  const [visibility, setVisibility] = useState(DEFAULT_CHART_VISIBILITY)
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialBeachId && dataset.beaches.some((beach) => beach.id === initialBeachId) ? [initialBeachId] : [],
  )
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchIndex, setSearchIndex] = useState(0)
  const [indexDates, setIndexDates] = useState<string[]>([])
  const [indexLoading, setIndexLoading] = useState(true)
  const [indexError, setIndexError] = useState(false)
  const [indexRetry, setIndexRetry] = useState(0)
  const [retry, setRetry] = useState(0)
  const [preset, setPreset] = useState<ViewPeriodPreset>('all')
  const [dateMode, setDateMode] = useState<'day' | 'week' | 'month' | 'custom'>('custom')
  const [period, setPeriod] = useState<HistoryPeriod | null>(null)
  const [pendingStart, setPendingStart] = useState('')
  const [pendingEnd, setPendingEnd] = useState('')
  const [periodError, setPeriodError] = useState<'invalid' | 'empty' | null>(null)
  const [mapIndex, setMapIndex] = useState(-1)
  const [isMobile, setIsMobile] = useState(false)
  const [summaryResult, setSummaryResult] = useState<ArchiveSummary & { key: string } | null>(null)
  const [historyResult, setHistoryResult] = useState<{ key: string; values: Map<string, HistoryPoint[]> } | null>(null)
  const [detailsResult, setDetailsResult] = useState<{ key: string; values: Map<string, BeachDayDetail>; failed: boolean } | null>(null)
  const [loadState, setLoadState] = useState<{ key: string; status: 'loading' | 'error' | 'ready' }>({ key: '', status: 'ready' })
  const [mapResult, setMapResult] = useState<{ key: string; points: TimelinePoint[] } | null>(null)
  const [mapState, setMapState] = useState<{ key: string; status: 'loading' | 'error' | 'ready' }>({ key: '', status: 'ready' })
  const summaryCache = useRef(new Map<string, ArchiveSummary>())
  const historyCache = useRef(new Map<string, Map<string, HistoryPoint[]>>())
  const mapCache = useRef(new Map<string, TimelinePoint[]>())
  const dateControl = useRef<HTMLDetailsElement>(null)
  const appliedSeed = useRef<string | undefined>(undefined)
  const [recordFocus, setRecordFocus] = useState<{ key: string; metric: MapMetric; beachId: string } | null>(null)

  useEffect(() => { setMetric(initialMapMetric) }, [initialMapMetric])

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 760px)')
    const update = () => setIsMobile(mobile.matches)
    update()
    mobile.addEventListener('change', update)
    return () => mobile.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !dateControl.current?.contains(event.target) && dateControl.current) {
        dateControl.current.open = false
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])

  useEffect(() => {
    let active = true
    setIndexLoading(true)
    setIndexError(false)
    loadTimelineIndex().then((index) => {
      if (active) setIndexDates(availableHistoryDates(index.dates))
    }).catch(() => {
      if (!active) return
      setIndexError(true)
    }).finally(() => { if (active) setIndexLoading(false) })
    return () => { active = false }
  }, [dataset.generatedAt, indexRetry])

  const archiveDates = useMemo(() => indexDates.filter((date) => date < today), [indexDates, today])
  const firstArchive = archiveDates[0] ?? ''
  const lastArchive = archiveDates[archiveDates.length - 1] ?? ''

  useEffect(() => {
    if (indexLoading || indexError || preset !== 'all') return
    setPeriod(resolveHistoryPeriod(firstArchive, lastArchive, archiveDates))
    setPendingStart(firstArchive)
    setPendingEnd(lastArchive)
  }, [archiveDates, firstArchive, indexError, indexLoading, lastArchive, preset])

  useEffect(() => {
    if (!initialBeachId) { appliedSeed.current = undefined; return }
    const beach = dataset.beaches.find((item) => item.id === initialBeachId)
    if (!beach || appliedSeed.current === initialBeachId) return
    appliedSeed.current = initialBeachId
    setSelectedIds([beach.id])
    setPreset('all')
    setPeriodError(null)
    setQuery('')
    setSearchOpen(false)
    if (territory !== 'all' && territory !== beach.territory) onTerritoryChange(beach.territory)
  }, [dataset.beaches, initialBeachId, onTerritoryChange, territory])

  useEffect(() => {
    setSelectedIds((ids) => {
      const present = ids.filter((id) => dataset.beaches.some((beach) => beach.id === id))
      return present.length === ids.length ? ids : present
    })
  }, [dataset.beaches])

  const territoryBeaches = useMemo(() => dataset.beaches.filter((beach) => territory === 'all' || beach.territory === territory), [dataset.beaches, territory])
  const selectedBeaches = useMemo(() => selectedIds.flatMap((id) => {
    const beach = dataset.beaches.find((item) => item.id === id)
    return beach ? [beach] : []
  }), [dataset.beaches, selectedIds])
  const activeBeaches = selectedBeaches
  const scope = activeBeaches.length ? 'beaches' : 'territory'
  const idsKey = activeBeaches.map((beach) => beach.id).join(',')
  const singleDay = period?.start === period?.end && period !== null
  const periodKey = period ? `${dataset.generatedAt}|${period.start}|${period.end}` : ''
  const dataKey = `${periodKey}|${scope === 'territory' ? territory : idsKey}|${singleDay ? 'day' : 'range'}`
  const hasDates = Boolean(period?.dates.length)
  const summaryValues = summaryResult?.key === dataKey ? summaryResult.values : []
  const historyValues = historyResult?.key === dataKey ? historyResult.values : new Map<string, HistoryPoint[]>()
  const dayDetails = detailsResult?.key === dataKey ? detailsResult.values : new Map<string, BeachDayDetail>()
  const loading = indexLoading || (hasDates && (loadState.key !== dataKey || loadState.status === 'loading'))
  const loadError = loadState.key === dataKey && loadState.status === 'error'
  const partialError = detailsResult?.key === dataKey && detailsResult.failed
  const rankedRecords = useMemo(() => !period || singleDay ? undefined : scope === 'territory'
    ? summaryResult?.key === dataKey ? summaryResult.records : undefined
    : historyResult?.key === dataKey ? recordsFromHistories(historyResult.values, period.start, period.end, dataset.beaches) : undefined,
  [period, singleDay, scope, summaryResult, historyResult, dataKey, dataset.beaches])

  useEffect(() => {
    if (!period || !hasDates) return
    const controller = new AbortController()
    let active = true
    setLoadState({ key: dataKey, status: 'loading' })
    const complete = () => { if (active) setLoadState({ key: dataKey, status: 'ready' }) }
    const fail = () => { if (active) setLoadState({ key: dataKey, status: 'error' }) }
    const archiveEnd = period.end < lastArchive ? period.end : lastArchive
    const includeCandidates = calendarDayCount(period.start, archiveEnd) > 366
    if (scope === 'territory') {
      loadBoundedHistory({
        start: period.start, end: archiveEnd, signal: controller.signal,
        cache: summaryCache.current, cacheKey: `${dataset.generatedAt}|${territory}|${includeCandidates ? 'candidates' : 'records'}`,
        load: async (start, end, signal) => {
          const result = await loadHistorySummary(start, end, territory, signal, includeCandidates)
          return {
            values: result.aggregates.filter((value) => value.date >= start && value.date <= end),
            records: result.records, recordCandidates: result.recordCandidates,
          }
        },
      }).then((chunks) => {
        if (!active) return
        const values = [...new Map(chunks.flatMap((chunk) => chunk.values).map((value) => [value.date, value])).values()]
        const records = mergeHistoricalRecords(chunks.map((chunk) => includeCandidates ? chunk.recordCandidates : chunk.records), dataset.beaches)
        setSummaryResult({ key: dataKey, values, records })
        complete()
      }).catch(fail)
    } else if (singleDay) {
      Promise.allSettled(idsKey.split(',').map((id) => loadBeachDayDetail(id, period.start))).then((results) => {
        if (!active) return
        const values = new Map<string, BeachDayDetail>()
        const ids = idsKey.split(',')
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.date === period.start && result.value.beachId === ids[index]) {
            values.set(ids[index], result.value)
          }
        })
        setDetailsResult({ key: dataKey, values, failed: values.size !== ids.length })
        if (values.size === 0) fail()
        else complete()
      })
    } else {
      loadBoundedHistory({
        start: period.start, end: archiveEnd, signal: controller.signal,
        cache: historyCache.current, cacheKey: `${dataset.generatedAt}|${idsKey}`,
        load: async (start, end, signal) => {
          const result = await loadHistoryBeachHistories(idsKey.split(','), start, end, signal)
          return new Map(result.histories.map((history) => [
            history.beachId,
            history.points.filter((point) => point.date >= start && point.date <= end && point.beachId === history.beachId)
              .map((point) => historyPointFromTimeline(point, [])),
          ]))
        },
      }).then((chunks) => {
        if (!active) return
        const values = new Map(idsKey.split(',').map((id) => [
          id,
          [...new Map(chunks.flatMap((chunk) => chunk.get(id) ?? []).map((point) => [point.date, point])).values()],
        ]))
        setHistoryResult({ key: dataKey, values })
        complete()
      }).catch(fail)
    }
    return () => { active = false; controller.abort() }
  }, [dataKey, dataset.beaches, dataset.generatedAt, hasDates, idsKey, lastArchive, period, retry, scope, singleDay, territory])

  const mapDates = period?.calendarDates ?? []
  const activeMapIndex = mapIndex >= 0 && mapIndex < mapDates.length ? mapIndex : Math.max(0, mapDates.length - 1)
  const mapDate = mapDates[activeMapIndex] ?? ''
  const recordBeachId = recordFocus?.key === dataKey && recordFocus.metric === metric ? recordFocus.beachId : ''
  const mapPublished = Boolean(period?.dates.includes(mapDate))
  const mapKey = `${dataset.generatedAt}|${territory}|${mapDate}`
  const mapLoading = mapPublished && mapDate < today && (mapState.key !== mapKey || mapState.status === 'loading')
  const mapError = mapPublished && mapState.key === mapKey && mapState.status === 'error'

  useEffect(() => { setMapIndex(-1) }, [periodKey])

  useEffect(() => {
    if (!mapDate || !mapPublished || mapDate >= today) return
    const controller = new AbortController()
    const cached = mapCache.current.get(mapKey)
    if (cached) {
      setMapResult({ key: mapKey, points: cached })
      setMapState({ key: mapKey, status: 'ready' })
      return
    }
    setMapState({ key: mapKey, status: 'loading' })
    loadHistoryDate(mapDate, territory, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.date !== mapDate) throw new Error('Unexpected history date')
      const points = result.points.filter((point) => point.date === mapDate)
      retainCache(mapCache.current, mapKey, points)
      setMapResult({ key: mapKey, points })
      setMapState({ key: mapKey, status: 'ready' })
    }).catch(() => {
      if (!controller.signal.aborted) {
        setMapState({ key: mapKey, status: 'error' })
      }
    })
    return () => controller.abort()
  }, [mapDate, mapKey, mapPublished, retry, territory, today])

  const mapBeaches = useMemo(() => {
    if (!mapPublished) return []
    if (mapResult?.key !== mapKey) return []
    const points = new Map(mapResult.points.map((point) => [point.beachId, point]))
    return territoryBeaches.flatMap((beach) => {
      const point = points.get(beach.id)
      if (!point || metricValue({ ...point, label: '', kind: 'history' }, metric) === undefined) return []
      return [mapBeach(beach, point)]
    })
  }, [mapKey, mapPublished, mapResult, metric, territoryBeaches])

  const searchMatches = useMemo(() => {
    const normalized = normalizeBeachSearch(query)
    return dataset.beaches.filter((beach) => !selectedIds.includes(beach.id) &&
      normalizeBeachSearch(`${beach.name} ${beach.municipality} ${beach.district}`).includes(normalized),
    ).slice(0, 7)
  }, [dataset.beaches, query, selectedIds])

  function applyPeriod(start: string, end: string, nextPreset: ViewPeriodPreset = preset) {
    const size = calendarDayCount(start, end)
    if (!size) { setPeriodError('invalid'); return }
    const next = resolveHistoryPeriod(start, end, archiveDates)
    setPendingStart(start)
    setPendingEnd(end)
    setPreset(nextPreset)
    setPeriod(next)
    setPeriodError(!next?.dates.length ? 'empty' : null)
    if (dateControl.current) dateControl.current.open = false
  }

  function choosePreset(nextPreset: Exclude<ViewPeriodPreset, 'custom'>, anchor = lastArchive) {
    setPeriodError(null)
    if (nextPreset === 'all') {
      applyPeriod(firstArchive, lastArchive, 'all')
      return
    }
    const bounds = historyPeriodBounds(nextPreset, anchor)
    if (bounds) applyPeriod(bounds.start, bounds.end, nextPreset)
  }

  function addBeach(id: string) {
    if (selectedIds.includes(id) || selectedIds.length >= 4) return
    const beach = dataset.beaches.find((item) => item.id === id)
    if (!beach) return
    setSelectedIds((ids) => ids.includes(id) || ids.length >= 4 ? ids : [...ids, id])
    if (territory !== 'all' && territory !== beach.territory) onTerritoryChange('all')
    setQuery('')
    setSearchOpen(false)
    setSearchIndex(0)
  }

  function selectMapBeach(id: string) {
    setRecordFocus(null)
    if (selectedIds.includes(id)) {
      setSelectedIds((ids) => ids.filter((value) => value !== id))
    }
    else addBeach(id)
  }

  const metricColor = `var(--cp-${metric}-line, var(--metric-${metric}))`
  const unit = metric === 'wind' ? windUnit === 'kmh' ? 'km/h' : 'kn' : '°C'
  const displayValue = (value: number) => metric === 'wind' ? convertWind(value, windUnit) : value
  const formatValue = (value: number | undefined) => value === undefined ? '—' : `${displayValue(value).toFixed(1)} ${unit}`
  const territoryName = territory === 'all' ? copy.portugal : territory === 'mainland' ? copy.mainland : territory === 'azores' ? copy.azores : copy.madeira
  const series: Series[] = scope === 'territory'
    ? [{ key: 'territory', name: territoryName, color: metricColor }]
    : activeBeaches.map((beach, index) => ({ key: `beach${index}`, name: uniqueShortBeachName(beach, dataset.beaches), color: beachColor(index) }))
  const hourlyMode = singleDay && scope === 'beaches'
  const hourlyAirAvailable = activeBeaches.some((beach) => hasHourlyAir(dayDetails.get(beach.id)?.hourly ?? []))
  const dailyAirFallback = hourlyMode && metric === 'air' && !hourlyAirAvailable
  const hourlyUtc = activeBeaches.length > 0 && activeBeaches.every((beach) => dayDetails.get(beach.id)?.hourlyTimeZone === 'UTC')
  const missingHourlyAir = hourlyMode && metric === 'air' && hourlyAirAvailable
    ? activeBeaches.filter((beach) => !hasHourlyAir(dayDetails.get(beach.id)?.hourly ?? []))
    : []
  const statistics: ChartStatistic[] = hourlyMode && !dailyAirFallback
    ? ['value']
    : scope === 'territory' || metric === 'wind' ? ['max', 'min', 'avg'] : ['max', 'min']
  const enabledStatistics = visibleChartStatistics(visibility, statistics)
  const lineStatistics = chartLineStatistics(visibility, statistics)
  const statisticLabels = { max: t.maximum, min: t.minimum, avg: t.average, value: t.hourly }
  const aggregateLookup = new Map(summaryValues.map((value) => [value.date, value]))
  const publishedSet = new Set(period?.dates)
  const histories = activeBeaches.map((beach) =>
    new Map((historyValues.get(beach.id) ?? []).map((point) => [point.date, point])))
  const summaries: Summary[] = scope === 'territory'
    ? [{ id: 'territory', name: territoryName, color: metricColor, values: [] }]
    : activeBeaches.map((beach, index) => ({ id: beach.id, name: series[index].name, color: series[index].color, values: [] }))

  function writeReadings(row: ChartPoint, key: string, readings: ChartReadings) {
    const shown = visibleChartReadings(readings, visibility, statistics, 'history')
    for (const statistic of enabledStatistics) {
      const value = shown[statistic]
      if (value !== undefined) row[`${key}_${statistic}`] = displayValue(value)
    }
    const range = chartReadingRange(shown)
    if (range) row[`${key}_range`] = range.map(displayValue)
    return shown
  }

  function prepareLines(data: ChartPoint[]) {
    data.forEach((row, index) => {
      for (const item of series) {
        const key = item.key
        const readings: ChartReadings = {}
        for (const statistic of enabledStatistics) {
          const value = row[`${key}_${statistic}`]
          if (typeof value === 'number') readings[statistic] = value
        }
        const adjacentRange = Array.isArray(data[index - 1]?.[`${key}_range`]) || Array.isArray(data[index + 1]?.[`${key}_range`])
        const lines = chartLineReadings(readings, lineStatistics, adjacentRange)
        for (const statistic of enabledStatistics) row[`${key}_${statistic}_line`] = lines[statistic]
      }
    })
  }

  const chartData: ChartPoint[] = (period?.calendarDates ?? []).map((date) => {
    const row: ChartPoint = { date }
    if (!publishedSet.has(date)) return row
    if (scope === 'territory') {
      const aggregate = aggregateLookup.get(date)
      const value = aggregate?.[metric]
      if (value) {
        const shown = writeReadings(row, 'territory', value)
        if (Object.keys(shown).length) summaries[0].values.push({ date, ...shown })
      }
    } else {
      histories.forEach((points, index) => {
        const point = points.get(date)
        const air = hourlyMode ? dayDetails.get(activeBeaches[index].id)?.air : undefined
        const values = dailyAirFallback
          ? { min: finite(air?.minimumCelsius), max: finite(air?.maximumCelsius) }
          : {
            min: finite(metric === 'water' ? point?.waterMin : metric === 'air' ? point?.airMin : point?.windMinKnots),
            max: finite(metric === 'water' ? point?.waterMax : metric === 'air' ? point?.airMax : point?.windMaxKnots),
            avg: metric === 'wind' ? finite(point?.windAverageKnots) : undefined,
          }
        const shown = writeReadings(row, `beach${index}`, values)
        if (Object.keys(shown).length) summaries[index].values.push({ date, ...shown })
      })
    }
    return row
  })
  prepareLines(chartData)

  const hourlyData: ChartPoint[] = Array.from({ length: 11 }, (_, index) => {
    const hour = index + 8
    const row: ChartPoint = { date: `${hour.toString().padStart(2, '0')}:00` }
    activeBeaches.forEach((beach, beachIndex) => {
      const reading = daytimeReadings(dayDetails.get(beach.id)?.hourly ?? []).find((item) => item.hour === hour)
      const value = finite(metric === 'water' ? reading?.waterTemperatureCelsius : metric === 'wind' ? reading?.windKnots : reading?.airTemperatureCelsius)
      writeReadings(row, `beach${beachIndex}`, { value })
    })
    return row
  })
  prepareLines(hourlyData)
  const displayedChart = hourlyMode && !dailyAirFallback ? hourlyData : chartData
  const chartValues = displayedChart.flatMap((point) => Object.entries(point)
    .filter(([key, value]) => key !== 'date' && (typeof value === 'number' || Array.isArray(value)))
    .flatMap(([, value]) => typeof value === 'number' ? [value] : Array.isArray(value) ? value : []))
  const hasChart = chartValues.length > 0 && !dailyAirFallback
  const chartMin = Math.floor(chartValues.reduce((min, value) => Math.min(min, value), Infinity) - 1)
  const chartMax = Math.ceil(chartValues.reduce((max, value) => Math.max(max, value), -Infinity) + 1)
  const hiddenSeries = !enabledStatistics.length
  const summaryDays = period?.calendarDates.length ?? 0
  const visibleDays = period?.dates.length ?? 0
  const readingHelp = hourlyMode ? dailyAirFallback ? t.airDaily : t.hourlyReading
    : scope === 'territory' ? `${t.territoryReading} ${metric !== 'wind' ? t.temperatureReading : ''}` : t.beachReading
  const periodLabel = period ? `${formatDate(period.start, language, true)}${singleDay ? '' : ` – ${formatDate(period.end, language, true)}`}` : ''
  const periodInvalid = !calendarDayCount(pendingStart, dateMode === 'custom' ? pendingEnd : pendingStart)
  const archiveLabel = archiveDates.length
    ? `${t.archive} · ${formatDate(archiveDates[0], language, true)} – ${formatDate(lastArchive, language, true)}`
    : t.noArchive

  return (
    <main id="app-content" tabIndex={-1} className="history-page" aria-label={copy.historyTitle}
      style={{ '--history-metric': metricColor, '--history-stats-height': `${Math.max(1, activeBeaches.length) * 44}px` } as CSSProperties}>
      <div className="history-content">
        <section className="history-controls" aria-label={t.chart}>
          <div className="history-comparison-row">
            <button type="button" className="history-return" onClick={onReturn} aria-label={returnLabel} title={returnLabel}><ArrowLeft size={18} aria-hidden="true" /></button>
            <TerritorySelect value={territory} language={language} onChange={onTerritoryChange} />
            <div className="history-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false) }}>
              <Search size={17} aria-hidden="true" />
              <input type="search" value={query} placeholder={t.chooseBeach}
                aria-label={t.chooseBeach} role="combobox" aria-expanded={searchOpen}
                aria-controls="history-beach-results" aria-autocomplete="list" autoComplete="off"
                aria-activedescendant={searchOpen && searchMatches[searchIndex] ? `history-option-${searchMatches[searchIndex].id}` : undefined}
                onFocus={() => setSearchOpen(true)}
                onClick={() => setSearchOpen(true)}
                onChange={(event) => { setQuery(event.target.value); setSearchIndex(0); setSearchOpen(true) }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSearchOpen(false)
                  if (event.key === 'ArrowDown') { event.preventDefault(); setSearchOpen(true); setSearchIndex((index) => Math.max(0, Math.min(index + 1, searchMatches.length - 1))) }
                  if (event.key === 'ArrowUp') { event.preventDefault(); setSearchIndex((index) => Math.max(0, index - 1)) }
                  if (event.key === 'Enter' && searchOpen && searchMatches[searchIndex]) { event.preventDefault(); addBeach(searchMatches[searchIndex].id) }
                }} />
              <span className="history-selection-count" title={t.compareHint}>{selectedBeaches.length}/4</span>
              {searchOpen && (
                <div className="history-search-popover">
                  <p role="status">{selectedBeaches.length === 4 ? t.maxBeaches : t.compareHint}</p>
                  <div className="history-search-results" id="history-beach-results" role="listbox" aria-label={t.addBeach}>
                    {searchMatches.map((beach, index) => (
                      <button key={beach.id} id={`history-option-${beach.id}`} role="option" type="button"
                        aria-selected={index === searchIndex} aria-disabled={selectedBeaches.length >= 4}
                        onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setSearchIndex(index)} onClick={() => addBeach(beach.id)}>
                        <strong>{beach.name}</strong><span>{beach.municipality} · {beach.district}</span>
                      </button>
                    ))}
                    {!searchMatches.length && <p>{t.noMatches}</p>}
                  </div>
                </div>
              )}
            </div>
            <div className="history-selected-beaches" aria-label={t.beaches}>
              {selectedBeaches.map((beach, index) => (
                <span className="history-chip" key={beach.id} style={{ '--history-beach': beachColor(index) } as CSSProperties}>
                  <i aria-hidden="true" /><span title={beach.name}>{uniqueShortBeachName(beach, dataset.beaches)}</span>
                  <button type="button" aria-label={`${t.remove} ${beach.name}`} onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== beach.id))}><X size={14} /></button>
                </span>
              ))}
              {!selectedBeaches.length && <span className="history-average-context" title={t.compareHint}><i aria-hidden="true" />{t.territoryAverage}</span>}
            </div>
          </div>

          <div className="history-toolbar">
            <div className="history-segment history-metric-control" role="group" aria-label={t.metric}>
              {([['water', Droplets], ['air', ThermometerSun], ['wind', Wind]] as const).map(([value, Icon]) => (
                <button key={value} className={`metric-tab metric-tab--${value}${metric === value ? ' active' : ''}`} type="button" aria-pressed={metric === value} onClick={() => setMetric(value)}>
                  <Icon size={16} aria-hidden="true" />{t[value]}
                </button>
              ))}
            </div>
            <div className="history-period">
              <div className="history-presets" role="group" aria-label={t.period}>
                {(['all', 'month'] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={preset === value} disabled={indexLoading || indexError || !lastArchive}
                    title={value === 'all' ? t.fullArchive : undefined} onClick={() => choosePreset(value)}>{t[value]}</button>
                ))}
              </div>
              <details className="history-date-control" ref={dateControl}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && dateControl.current) {
                    dateControl.current.open = false
                    dateControl.current.querySelector('summary')?.focus()
                  }
                }}>
                <summary aria-label={t.pickDate} title={periodLabel || undefined}
                  onClick={() => {
                    if (dateControl.current?.open) return
                    setDateMode(preset === 'day' || preset === 'week' || preset === 'month' ? preset : 'custom')
                    setPendingStart(period?.start || lastArchive)
                    setPendingEnd(period?.end || lastArchive)
                  }}>
                  <CalendarDays size={16} aria-hidden="true" />
                  <span>{t.pickDate}</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </summary>
                <div className="history-date-popover">
                  <div className="history-date-heading">
                    <strong>{t.pickDate}</strong>
                    <button type="button" className="history-icon-button" aria-label={t.close} onClick={() => { if (dateControl.current) { dateControl.current.open = false; dateControl.current.querySelector('summary')?.focus() } }}><X size={17} /></button>
                  </div>
                  <div className="history-segment history-date-modes" role="group" aria-label={t.period}>
                    {(['day', 'week', 'month', 'custom'] as const).map((value) => (
                      <button type="button" key={value} aria-pressed={dateMode === value}
                        disabled={(value === 'week' || value === 'month') && (!lastArchive || indexError)} onClick={() => {
                        setDateMode(value)
                        if (dateMode === 'custom' && value !== 'custom') setPendingStart(period?.end || lastArchive)
                      }}>{t[value]}</button>
                    ))}
                  </div>
                  <form className="history-date-fields" onSubmit={(event) => {
                    event.preventDefault()
                    if (dateMode === 'custom') applyPeriod(pendingStart, pendingEnd, 'custom')
                    else choosePreset(dateMode, pendingStart)
                  }}>
                    <label className="history-field"><span>{dateMode === 'custom' ? t.from : t.day}</span>
                      <input type="date" value={pendingStart} min={firstArchive} max={lastArchive}
                        required onChange={(event) => setPendingStart(event.target.value)} />
                    </label>
                    {dateMode === 'custom' && <label className="history-field"><span>{t.to}</span>
                      <input type="date" value={pendingEnd} min={pendingStart || firstArchive} max={lastArchive} required onChange={(event) => setPendingEnd(event.target.value)} />
                    </label>}
                    <button className="history-primary" type="submit" disabled={periodInvalid || indexLoading || !archiveDates.length}>{t.apply}</button>
                    {periodInvalid && pendingStart && pendingEnd && <p className="history-note" role="status">{t.periodError}</p>}
                  </form>
                  <p className="history-note" title={t.rangeHint}>{indexError ? t.indexError : archiveLabel}</p>
                </div>
              </details>
            </div>
          </div>
        </section>

        {indexError && <div className="history-message" role="status">{t.indexError}<button type="button" onClick={() => setIndexRetry((value) => value + 1)}>{t.retry}</button></div>}
        {periodError && <div className="history-message" role="alert">{periodError === 'invalid' ? t.periodError : t.outsideArchive}</div>}

        <div className="history-workspace">
          <section className="history-map-section history-card" aria-label={`${t.map}: ${territoryName}`}>
            <header className="history-map-heading">
              <strong>{t.map}</strong>
              <label className="history-map-date"><span>{t.day}</span>
                <input type="date" aria-label={t.mapDate} value={mapDate} min={period?.start} max={period?.end} disabled={!mapDates.length}
                  onChange={(event) => {
                    const index = mapDates.indexOf(event.target.value)
                    if (index >= 0) setMapIndex(index)
                  }} />
              </label>
              {!singleDay && <button type="button" className="history-text-button" disabled={!mapDate} onClick={() => choosePreset('day', mapDate)}>{t.viewDay}</button>}
            </header>
            <div className="history-map-canvas">
              <Suspense fallback={<div className="map-loading"><LoadingIndicator variant="compact" label={copy.loading} /></div>}>
                <PortugalMap beaches={mapBeaches} districtWeather={[]} activeDate={mapDate} language={language} selectedId={recordBeachId || (scope === 'beaches' ? selectedIds[0] ?? '' : '')}
                  territory={territory} theme={theme} windUnit={windUnit} mapMetric={metric} isMobile={isMobile} clusterRadius={36} clusterBaseZoom={6} clusterZoomRate={1.65}
                  onSelect={selectMapBeach} onClusterSelect={(id) => { setRecordFocus(null); addBeach(id) }}
                  onClearSelection={() => { setRecordFocus(null); setSelectedIds([]) }} />
              </Suspense>
              <MapLegend language={language} metric={metric} windUnit={windUnit} />
              {(indexLoading || mapLoading) && <div className="map-loading"><LoadingIndicator variant="compact" label={copy.loading} /></div>}
              {!indexLoading && !mapLoading && (!mapDates.length || !mapBeaches.length || mapError) && (
                <div className="history-map-notice" role={mapError ? 'alert' : 'status'}>
                  <span>{mapError ? t.loadError : mapDates.length ? t.mapEmpty : preset === 'all' && !indexError ? t.noArchive : t.outsideArchive}</span>
                  {mapError && <button className="history-text-button" type="button" onClick={() => setRetry((value) => value + 1)}>{t.retry}</button>}
                </div>
              )}
            </div>
            <p className="history-map-hint">{t.mapHint}</p>
          </section>

        <section className="history-chart-card history-card" aria-labelledby="history-chart-title" aria-busy={loading}>
          <header className="history-chart-heading">
            <h1 id="history-chart-title">{t[metric]} <span>· {unit}</span></h1>
            <span className="history-chart-context">{periodLabel}</span>
          </header>

          {loading ? (
            <div className="history-chart-placeholder" role="status"><LoadingIndicator variant="compact" label={t.loading} /></div>
          ) : loadError ? (
            <div className="history-chart-placeholder" role="alert"><p>{t.loadError}</p><button className="history-primary" type="button" onClick={() => setRetry((value) => value + 1)}>{t.retry}</button></div>
          ) : !hasDates ? (
            <div className="history-chart-placeholder"><CalendarDays size={26} aria-hidden="true" /><p>{indexError ? t.indexError : preset === 'all' ? t.noArchive : t.outsideArchive}</p></div>
          ) : dailyAirFallback && !hiddenSeries ? (
            <div className="history-air-day">
              <p>{t.airDaily}</p>
              {activeBeaches.map((beach, index) => {
                const readings = summaries[index].values[0]
                return <div className="history-summary-row" key={beach.id}><strong><i style={{ background: series[index].color }} />{series[index].name}</strong><dl>
                  {enabledStatistics.map((statistic) => <div key={statistic}><dt>{statisticLabels[statistic]}</dt><dd>{formatValue(readings?.[statistic])}</dd></div>)}
                </dl></div>
              })}
            </div>
          ) : hasChart ? (
            <div className="history-chart" role="img" aria-label={`${t.chart}: ${scope === 'territory' ? territoryName : series.map((item) => item.name).join(', ')}, ${t[metric]}, ${periodLabel}`}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart accessibilityLayer data={displayedChart} margin={{ top: 14, right: 14, left: -12, bottom: 4 }}
                  onClick={(state) => {
                    if (hourlyMode || !state?.activeLabel) return
                    const index = mapDates.indexOf(String(state.activeLabel))
                    if (index >= 0) setMapIndex(index)
                  }}>
                  <CartesianGrid vertical={false} stroke="var(--cp-border)" strokeDasharray="3 5" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={isMobile ? 30 : 42} tick={{ fill: 'var(--cp-text-muted)', fontSize: 12 }}
                    tickFormatter={(date: string) => hourlyMode ? date : formatDate(date, language)} />
                  <YAxis width={56} axisLine={false} tickLine={false} domain={[metric === 'wind' ? Math.max(0, chartMin) : chartMin, chartMax]} tick={{ fill: 'var(--cp-text-muted)', fontSize: 12 }} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0]?.payload as ChartPoint | undefined
                    if (!row) return null
                    return <div className="history-tooltip"><strong>{hourlyMode ? `${periodLabel} · ${label}` : formatDate(String(label), language, true)}</strong><small>{t.dayKindArchive} · {unit}</small>
                      <table><thead><tr><th scope="col">{scope === 'territory' ? t.territoryAverage : t.beaches}</th>{enabledStatistics.map((statistic) => <th scope="col" key={statistic}>{statisticLabels[statistic]}</th>)}</tr></thead>
                        <tbody>{series.map((item) => <tr key={item.key}>
                          <th scope="row"><i style={{ background: item.color }} aria-hidden="true" />{item.name}</th>
                          {enabledStatistics.map((statistic) => {
                            const value = row[`${item.key}_${statistic}`]
                            return <td key={statistic}>{typeof value === 'number' ? value.toFixed(1) : '—'}</td>
                          })}
                        </tr>)}</tbody>
                      </table>
                    </div>
                  }} />
                  {enabledStatistics.includes('min') && enabledStatistics.includes('max') && series.map((item) => (
                   <Area key={`${item.key}_range`} type="linear" dataKey={`${item.key}_range`}
                     connectNulls={false} stroke="none" fill={item.color} fillOpacity={scope === 'territory' ? 0.12 : 0.055}
                     activeDot={false} isAnimationActive={false} />
                  ))}
                  {series.flatMap((item) => enabledStatistics.map((statistic) => (
                   <Line key={`${item.key}_${statistic}`} dataKey={`${item.key}_${statistic}_line`} type="linear" connectNulls={false} stroke={item.color}
                     strokeWidth={statistic === 'min' ? 1.6 : 2.5} strokeDasharray={statistic === 'min' ? '2 3' : undefined}
                      dot={(props) => {
                        const index = props.index ?? 0
                        const key = `${item.key}_${statistic}_line`
                        const value = displayedChart[index]?.[key]
                        const isolated = typeof displayedChart[index - 1]?.[key] !== 'number' && typeof displayedChart[index + 1]?.[key] !== 'number'
                        return typeof value === 'number' && (displayedChart.length < 45 || isolated)
                          ? <circle key={`${key}-${index}`} cx={props.cx} cy={props.cy} r={isolated ? 3 : 2} fill={item.color} strokeWidth={0} />
                          : <g key={`${key}-${index}`} />
                      }}
                      activeDot={{ r: 5, fill: item.color }} isAnimationActive={false} />
                  )))}
                  {!hourlyMode && mapDate && <ReferenceLine x={mapDate} stroke="var(--cp-text-muted)" strokeDasharray="3 3" strokeWidth={1.5} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="history-chart-placeholder" role="status"><p>{hiddenSeries ? t.hiddenSeries : t.noData}</p></div>}

          {hasDates && !loading && !loadError && (
            <>
              <ChartSeriesLegend language={language} visibility={visibility} statistics={statistics} showForecast={false}
                help={`${readingHelp} ${t.legendHelp}`} onToggle={(key) => setVisibility((value) => ({ ...value, [key]: !value[key] }))} />
              {hourlyMode && !dailyAirFallback && <p className="history-reading">{t.hourlyKey}{hourlyUtc ? ' · UTC' : ''}</p>}
              {missingHourlyAir.length > 0 && <p className="history-note">
                {language === 'pt' ? 'Sem ar horário' : 'No hourly air'}: {missingHourlyAir.map((beach) => uniqueShortBeachName(beach, dataset.beaches)).join(', ')}
              </p>}
              {!hourlyMode && !hiddenSeries && <div className="history-records" role="group" aria-label={t.periodSummary}
                title={scope === 'territory' ? t.territorySummary : t.beachSummary}>
                {summaries.map((summary) => <div className="history-record" key={summary.id} role="group" aria-label={summary.name}
                  data-comparison={summaries.length > 1} style={{ '--history-record-colour': summary.color, '--history-record-columns': enabledStatistics.length } as CSSProperties}>
                  {summaries.length > 1 && <strong className="history-record-name" title={summary.name}>
                    <i aria-hidden="true" />{summary.name}
                  </strong>}
                  {enabledStatistics.map((statistic) => {
                    const result = summarizeChartStatistic(summary.values, statistic)
                    const content = <>
                      <span>{statisticLabels[statistic]} <b title={formatValue(result.value)}>{result.value === undefined ? '—' : displayValue(result.value).toFixed(1)}</b></span>
                      {result.date && <time dateTime={result.date}>{formatDate(result.date, language)}</time>}
                    </>
                    const coverage = `${result.count}/${summaryDays} ${t.coverage}`
                    const recordDate = result.date
                    return recordDate ? <button type="button" key={statistic} className="history-record-value" data-statistic={statistic}
                      title={`${t.recordDay} · ${formatDate(recordDate, language, true)} · ${coverage}`}
                      aria-label={`${summary.name} · ${statisticLabels[statistic]} ${formatValue(result.value)} · ${formatDate(recordDate, language, true)} · ${t.recordDay}`}
                      onClick={() => {
                        const index = mapDates.indexOf(recordDate)
                        if (index >= 0) setMapIndex(index)
                      }}>{content}</button> : <div key={statistic} className="history-record-value" data-statistic={statistic} title={coverage}>{content}</div>
                  })}
                  {summary.values.length < summaryDays && <small className="history-record-coverage">{summary.values.length}/{summaryDays} {t.coverage}</small>}
                </div>)}
              </div>}
              {partialError && <p className="history-message" role="status">{t.partialError}<button type="button" onClick={() => setRetry((value) => value + 1)}>{t.retry}</button></p>}
            </>
          )}
          {period && <footer className="history-provenance" title={t.archiveNote} aria-label={`${visibleDays} ${t.days}. ${t.archiveNote}`}>
            <span>{visibleDays} {t.days} · {t.forecasts}</span>
            {period.clipped && <span>{t.clipped}</span>}
            {Boolean(period.missingDays) && <span>{period.missingDays} {t.gap}</span>}
          </footer>}
          {!singleDay && hasDates && !loading && !loadError && (visibility.max || visibility.min) && (
            <section className="history-location-records" aria-label={`${t.recordLocations} · ${t[metric]} · ${periodLabel}`}
              title={language === 'pt'
                ? `Preferimos concelhos diferentes quando a diferença não ultrapassa ${HIGHLIGHT_SIMILARITY.temperatureCelsius} °C ou ${HIGHLIGHT_SIMILARITY.windKnots} kn.`
                : `Different municipalities when values are within ${HIGHLIGHT_SIMILARITY.temperatureCelsius} °C or ${HIGHLIGHT_SIMILARITY.windKnots} kn.`}>
              {rankedRecords ? (['max', 'min'] as const).filter((direction) => visibility[direction]).map((direction) => (
                <div className="history-location-column" key={direction}>
                  <h2>{direction === 'max' ? t.highest : t.lowest}<span>{unit}</span></h2>
                  {rankedRecords[metric][direction].length ? rankedRecords[metric][direction].map((record) => {
                    const beach = dataset.beaches.find((item) => item.id === record.beachId)
                    const name = beach ? uniqueShortBeachName(beach, dataset.beaches) : `${copy.beach} ${record.beachId}`
                    return <button type="button" key={record.beachId} className="history-location-record"
                      title={`${beach?.name ?? name} · ${beach?.municipality ?? ''} · ${beach?.district ?? ''} · ${formatDate(record.date, language, true)} · ${t.recordBeach}`}
                      aria-label={`${beach?.name ?? name} · ${beach?.municipality ?? ''} · ${beach?.district ?? ''} · ${direction === 'max' ? t.maximum : t.minimum} ${formatValue(record.value)} · ${formatDate(record.date, language, true)} · ${t.recordBeach}`}
                      onClick={() => {
                        const index = mapDates.indexOf(record.date)
                        if (index >= 0) {
                          setMapIndex(index)
                          setRecordFocus({ key: dataKey, metric, beachId: record.beachId })
                          if (isMobile) document.querySelector('.history-map-section')?.scrollIntoView({ block: 'nearest' })
                        }
                      }}>
                      <span><strong>{beach?.name ?? name}</strong>
                        {beach && <small>{beach.municipality} · {beach.district}</small>}
                        <time dateTime={record.date}>{formatDate(record.date, language)}</time></span>
                      <b>{displayValue(record.value).toFixed(1)}</b>
                    </button>
                  }) : <p className="history-note">{t.noData}</p>}
                </div>
              )) : <p className="history-note">{t.recordsUnavailable}</p>}
            </section>
          )}
        </section>
        </div>

        {hourlyMode && hasChart && !loading && !loadError && (
          <details className="history-hourly history-card">
            <summary>{t.hourly}{metric === 'wind' ? ` · ${t.windDirection}` : ''}<ChevronDown size={18} aria-hidden="true" /></summary>
            {metric === 'wind' && <p className="history-note">{t.windDirectionNote}</p>}
            <div className="history-hourly-scroll" tabIndex={0} role="region" aria-label={t.hourly}>
              <table><caption>{periodLabel} · {unit}{hourlyUtc ? ' · UTC' : ''}</caption><thead><tr><th scope="col">{t.time}</th>{activeBeaches.map((beach, index) => <th key={beach.id} scope="col">{series[index].name}</th>)}</tr></thead>
                <tbody>{Array.from({ length: 11 }, (_, index) => index + 8).map((hour) => <tr key={hour}><th scope="row">{`${hour.toString().padStart(2, '0')}:00`}</th>
                  {activeBeaches.map((beach) => {
                    const reading = daytimeReadings(dayDetails.get(beach.id)?.hourly ?? []).find((item) => item.hour === hour)
                    const value = finite(metric === 'water' ? reading?.waterTemperatureCelsius : metric === 'air' ? reading?.airTemperatureCelsius : reading?.windKnots)
                    const direction = reading?.windDirection
                    const degrees = windDirectionDegrees(direction)
                    return <td key={beach.id}>{value === undefined ? '—' : displayValue(value).toFixed(1)}
                      {metric === 'wind' && direction && <span className="history-direction" title={`${t.windDirection}: ${direction}`}>{direction}{degrees !== null && <ArrowUp size={13} aria-hidden="true" style={{ transform: `rotate(${degrees + 180}deg)` }} />}</span>}
                    </td>
                  })}
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        )}

      </div>
    </main>
  )
}
