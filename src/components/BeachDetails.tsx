import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowUpRight, Droplets, ExternalLink, ThermometerSun, Wind } from 'lucide-react'
import { historyPointFromTimeline, loadEvolutionBeachHistories, loadTimelineIndex } from '../data/api'
import { getCopy, type Language } from '../i18n'
import { forecastForDate } from '../lib/beach-discovery'
import { lisbonDate } from '../lib/date-classification'
import { availableEvolutionDates, evolutionPeriodBounds } from '../lib/evolution-period'
import { getRelativeLabel } from '../lib/relative-date'
import { convertWind, formatDistance, type WindUnit } from '../lib/units'
import type { BeachViewModel, HistoryPoint, MapMetric } from '../types'
import BeachDayHours from './BeachDayHours'
import LoadingIndicator from './LoadingIndicator'

const MetricHistoryChart = lazy(() => import('./MetricHistoryChart'))

function number(value: number | undefined, decimals = 1) {
  return value !== undefined && Number.isFinite(value) ? value.toFixed(decimals) : '—'
}

export default function BeachDetails({
  beach, date, dates, language, windUnit, metric, nearbyBeaches = [], onSelectNearby, onMetricChange, onExploreHistory,
}: {
  beach: BeachViewModel
  date: string
  dates: string[]
  language: Language
  windUnit: WindUnit
  metric: MapMetric
  nearbyBeaches?: BeachViewModel[]
  onSelectNearby?: (beach: BeachViewModel) => void
  onMetricChange: (metric: MapMetric) => void
  onExploreHistory: () => void
}) {
  const copy = getCopy(language)
  const pt = language === 'pt'
  const [history, setHistory] = useState<HistoryPoint[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const forecast = forecastForDate(beach, date)
  const dayLabel = getRelativeLabel(date, dates, language)
  const windLabel = windUnit === 'kmh' ? 'km/h' : 'kn'

  useEffect(() => {
    const controller = new AbortController()
    setHistory(null)
    setError(false)
    loadTimelineIndex().then(async (index) => {
      if (controller.signal.aborted) return
      const archived = availableEvolutionDates(index.dates.filter((day) => day < lisbonDate()))
      const bounds = evolutionPeriodBounds('30d', archived.at(-1) ?? '')
      if (!bounds) { setHistory([]); return }
      const start = bounds.start < archived[0] ? archived[0] : bounds.start
      const result = await loadEvolutionBeachHistories([beach.id], start, bounds.end, controller.signal)
      if (controller.signal.aborted) return
      const points = result.histories.find((item) => item.beachId === beach.id)?.points
      if (!points) throw new Error('Requested beach history is missing')
      setHistory(points.map((point) => historyPointFromTimeline(point, dates)))
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      console.warn('Selected beach history loading failed:', reason)
      setError(true)
    })
    return () => controller.abort()
  }, [beach.id, dates, attempt])

  return (
    <section className="beach-details" aria-labelledby="beach-detail-title">
      <div className="beach-title">
        <div><h2 id="beach-detail-title" tabIndex={-1}>{beach.name}</h2><small>{dayLabel.compactDate}</small></div>
        <span>{beach.municipality} · {beach.district}</span>
      </div>
      {nearbyBeaches.length > 1 && onSelectNearby && <label className="beach-nearby">
        <span>{pt ? 'Praias próximas' : 'Nearby beaches'}</span>
        <select value={beach.id} onChange={(event) => {
          const next = nearbyBeaches.find((item) => item.id === event.target.value)
          if (next) onSelectNearby(next)
        }}>
          {nearbyBeaches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      {!forecast ? <p role="status">{copy.detailUnavailable}</p> : (
        <div className="beach-forecast-cards" role="group" aria-label={copy.mapMetric}>
          <button className="beach-kpi beach-kpi-water" type="button" aria-pressed={metric === 'water'} onClick={() => onMetricChange('water')}>
            <span><Droplets size={17} />{copy.water}</span>
            <strong>{number(forecast.waterMax)}<small>°C</small></strong>
            <span>{copy.maximum}</span>
            <small>{pt ? 'mín' : 'min'} {number(forecast.waterMin)}°</small>
          </button>
          <button className="beach-kpi beach-kpi-air" type="button" aria-pressed={metric === 'air'} onClick={() => onMetricChange('air')}>
            <span><ThermometerSun size={17} />{copy.air}</span>
            <strong>{number(forecast.airMax, 0)}<small>°C</small></strong>
            <span>{copy.maximum}</span>
            <small>{pt ? 'mín' : 'min'} {number(forecast.airMin, 0)}°</small>
          </button>
          <button className="beach-kpi beach-kpi-wind" type="button" aria-pressed={metric === 'wind'} onClick={() => onMetricChange('wind')}>
            <span><Wind size={17} />{copy.wind}</span>
            <strong>{number(convertWind(forecast.windAverageKnots, windUnit))}<small>{windLabel}</small></strong>
            <span>{copy.average}</span>
            <small>08–18h</small>
          </button>
        </div>
      )}
      <section className="beach-detail-history" aria-label={copy.history}>
        <div className="beach-chart-heading">
          <h3>{pt ? 'Últimos 30 dias' : 'Last 30 days'}</h3>
          <button type="button" onClick={onExploreHistory}
            title={pt ? 'Ver todo o histórico desta praia' : 'View this beach’s full history'}>
            {pt ? 'Ver tudo' : 'View all'}<ArrowUpRight size={14} />
          </button>
        </div>
        {error ? <div className="beach-inline-error" role="alert">
          <p>{copy.noHistoryAvailable}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>{copy.retry}</button>
        </div> : history === null ? <div className="beach-history-loading"><LoadingIndicator variant="compact" label={copy.loadingHistory} /></div> : (
          <>
            {history.length === 0 && <p role="status">{copy.noHistoryAvailable}</p>}
            <div className="history-chart">
              <Suspense fallback={<LoadingIndicator variant="compact" label={copy.loadingHistory} />}>
                <MetricHistoryChart key={metric} history={history} forecasts={beach.daily}
                  language={language} windUnit={windUnit} metric={metric} />
              </Suspense>
            </div>
          </>
        )}
      </section>
      <BeachDayHours key={`${beach.id}/${date}`} beachId={beach.id} date={date} language={language} windUnit={windUnit} />
      <div className="beach-data-note">
        {forecast && <p>{pt ? 'Ar: previsão de' : 'Air: forecast for'} {forecast.airLocation} · {formatDistance(forecast.airDistanceKm)}</p>}
        <p>{pt ? 'Previsões, não observações.' : 'Forecasts, not observations.'}</p>
        <a target="_blank" rel="noreferrer noopener"
          href={`https://www.ipma.pt/pt/maritima/costeira/index.jsp?selLocal=${encodeURIComponent(beach.id)}&idLocal=${encodeURIComponent(beach.id)}`}>
          {pt ? 'Dados: IPMA.pt' : 'Data: IPMA.pt'}<ExternalLink size={12} /><span className="sr-only">{copy.opensNewWindow}</span>
        </a>
      </div>
    </section>
  )
}
