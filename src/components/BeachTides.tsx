import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ExternalLink, Waves } from 'lucide-react'
import { loadBeachTideForecast } from '../data/api'
import { getCopy, type Language } from '../i18n'
import { lisbonDate } from '../lib/date-classification'
import { formatClock, timeZoneLabel, timeZoneRangeLabel, utcHourInstant } from '../lib/time-zone'
import { formatDistance } from '../lib/units'
import type { BeachTideForecast, ForecastTimeZone } from '../types'
import LoadingIndicator from './LoadingIndicator'

export default function BeachTides({ beachId, date, language, timeZone }: {
  beachId: string
  date: string
  language: Language
  timeZone: ForecastTimeZone
}) {
  const [open, setOpen] = useState(false)
  const [forecast, setForecast] = useState<BeachTideForecast | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const copy = getCopy(language)
  const historical = !date || date < lisbonDate()

  useEffect(() => {
    setForecast((previous) => previous?.beachId === beachId && previous.date === date ? previous : null)
    setError(false)
    if (historical) return
    const controller = new AbortController()
    loadBeachTideForecast(beachId, date, controller.signal)
      .then((result) => {
        if (result.timeZone !== timeZone) throw new Error('Tide timezone does not match the selected beach')
        if (!controller.signal.aborted) setForecast(result)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        console.warn('Tide forecast loading failed:', reason)
        setError(true)
      })
    return () => controller.abort()
  }, [beachId, date, historical, attempt, timeZone])

  if (historical) return null
  const current = forecast?.beachId === beachId && forecast.date === date ? forecast : null
  const hasEvents = current?.status === 'available' || current?.status === 'stale'
  const zoneLabel = timeZoneRangeLabel(
    hasEvents ? current.events.map((event) => event.timeUtc) : [utcHourInstant(date, 12)],
    timeZone, language,
  )
  const content = error ? (
    <div className="beach-inline-error" role="alert">
      <p>{copy.tideLoadFailed}</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>{copy.retry}</button>
    </div>
  ) : !current ? <LoadingIndicator variant="compact" label={copy.loading} /> : (
    <>
      {current.status === 'stale' && <p className="beach-tide-warning" role="status">{copy.tideStale}</p>}
      {hasEvents ? (
        <dl className="beach-tide-times">
          {(['low', 'high'] as const).map((kind) => {
            const events = current.events.filter((event) => event.kind === kind)
            return <div key={kind}>
              <dt>{kind === 'low' ? <ArrowDown size={14} aria-hidden="true" /> : <ArrowUp size={14} aria-hidden="true" />}
                {kind === 'low' ? copy.lowTide : copy.highTide}
              </dt>
              <dd>{events.length === 0 ? <span aria-label={copy.tideNoEvent}>—</span> : events.map((event) => (
                <time key={event.timeUtc} dateTime={event.timeUtc} title={timeZoneLabel(event.timeUtc, timeZone, language)}>
                  {formatClock(event.timeUtc, timeZone)}
                </time>
              ))}</dd>
            </div>
          })}
        </dl>
      ) : <p className="beach-tide-unavailable" role="status">
        {current.status === 'unsupported' ? copy.tideUnsupported : copy.tideUnavailable}
      </p>}
      <div className="beach-tide-source">
        <p>{copy.tideSource} <a href={current.source.url} target="_blank" rel="noreferrer noopener" title={current.source.name}>
          Instituto Hidrográfico de Portugal<ExternalLink size={11} aria-hidden="true" /><span className="sr-only">{copy.opensNewWindow}</span>
        </a></p>
        {current.reference && <p title={copy.tideApproximation}>
          {copy.tideReference} <strong>{current.reference.name}</strong> · {formatDistance(current.reference.distanceKm)}
        </p>}
      </div>
    </>
  )

  return (
    <details className="beach-tides" open={open} onToggle={(event) => {
      const expanded = event.currentTarget.open
      setOpen(expanded)
      if (expanded) setAttempt((value) => value + 1)
    }}>
      <summary>
        <Waves size={16} aria-hidden="true" />{copy.tides}
        <small title={timeZone}>{zoneLabel}</small>
      </summary>
      {open && <div className="beach-tides-content">{content}</div>}
    </details>
  )
}
