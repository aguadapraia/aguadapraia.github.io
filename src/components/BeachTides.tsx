import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Waves } from 'lucide-react'
import { loadBeachTideForecast } from '../data/api'
import { getCopy, type Language } from '../i18n'
import { lisbonDate } from '../lib/date-classification'
import { describeTideDay } from '../lib/tide-day'
import { formatDistance } from '../lib/units'
import type { BeachTideForecast, ForecastTimeZone } from '../types'
import LoadingIndicator from './LoadingIndicator'
import TideDayProfile from './TideDayProfile'

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
  const pending = useRef(false)
  const copy = getCopy(language)
  const historical = !date || date < lisbonDate()

  useEffect(() => {
    setForecast((previous) => previous?.beachId === beachId && previous.date === date ? previous : null)
    setError(false)
    pending.current = false
    if (historical) return
    const controller = new AbortController()
    pending.current = true
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
      .finally(() => { if (!controller.signal.aborted) pending.current = false })
    return () => controller.abort()
  }, [beachId, date, historical, attempt, timeZone])

  const current = forecast?.beachId === beachId && forecast.date === date ? forecast : null
  const hasEvents = current?.status === 'available' || current?.status === 'stale'
  const day = useMemo(() => hasEvents ? describeTideDay(current, language) : null, [current, hasEvents, language])
  if (historical) return null
  const preview = !open && !error && day?.daytimeEvents.length
    ? day.daytimeEvents.map((event) => `${event.label} ${event.kind === 'low' ? copy.lowTide : copy.highTide}`).join(' · ')
    : '08–18h'
  const content = error ? (
    <div className="beach-inline-error" role="alert">
      <p>{copy.tideLoadFailed}</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>{copy.retry}</button>
    </div>
  ) : !current ? <LoadingIndicator variant="compact" label={copy.loading} /> : (
    <>
      {current.status === 'stale' && <p className="beach-tide-warning" role="status">{copy.tideStale}</p>}
      {day ? (
        <TideDayProfile day={day} language={language} />
      ) : <p className="beach-tide-unavailable" role="status">
        {current.status === 'unsupported' ? copy.tideUnsupported : copy.tideUnavailable}
      </p>}
      <div className="beach-tide-source">
        <p>{copy.tideSource} <a href={current.source.url} target="_blank" rel="noreferrer noopener">
          Instituto Hidrográfico.pt<ExternalLink size={11} aria-hidden="true" /><span className="sr-only">{copy.opensNewWindow}</span>
        </a></p>
        {current.reference && <p title={copy.tideApproximation}>
          {copy.tideReference} {current.reference.name} · {formatDistance(current.reference.distanceKm)}
          <span className="sr-only">. {copy.tideApproximation}</span>
        </p>}
        {current.reference?.concordance && <p>
          <a href="https://loja.hidrografico.pt/ln/web/wp-content/uploads/2023/11/TabelaMare_I_2026_signed.pdf#page=194"
            target="_blank" rel="noreferrer noopener">
            {language === 'pt' ? 'Concordância IH' : 'IH tidal correction'} {current.reference.concordance.edition}
            <ExternalLink size={11} aria-hidden="true" /><span className="sr-only">{copy.opensNewWindow}</span>
          </a>
          {' · '}{language === 'pt' ? 'via' : 'from'} {current.reference.concordance.sourcePortName}
        </p>}
      </div>
    </>
  )

  return (
    <details className="beach-tides" open={open} onToggle={(event) => {
      if (event.target !== event.currentTarget) return
      const expanded = event.currentTarget.open
      setOpen(expanded)
      if (expanded && !pending.current) setAttempt((value) => value + 1)
    }}>
      <summary>
        <Waves size={16} aria-hidden="true" />{copy.tides}
        <small>{current?.status === 'stale' && <span className="tide-stale-indicator">{language === 'pt' ? 'Por atualizar · ' : 'Not refreshed · '}</span>}{preview}</small>
      </summary>
      {open && <div className="beach-tides-content">{content}</div>}
    </details>
  )
}
