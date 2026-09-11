import { useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import { getCopy, type Language } from '../i18n'
import { localDateTimeZoneLabel, timeZoneForBeach } from '../lib/time-zone'
import { formatDistance } from '../lib/units'
import { isLocalAirForecast } from '../lib/air-source'
import type { BeachViewModel, DailyBeachForecast } from '../types'

export default function BeachDataNote({ beach, date, forecast, language }: {
  beach: BeachViewModel
  date: string
  forecast: DailyBeachForecast | undefined
  language: Language
}) {
  const copy = getCopy(language)
  const timeZone = timeZoneForBeach(beach.territory)
  const zoneLabel = useMemo(() => date ? localDateTimeZoneLabel(date, timeZone, language) : '', [date, timeZone, language])
  const external = <><ExternalLink size={11} aria-hidden="true" /><span className="sr-only">{copy.opensNewWindow}</span></>
  return (
    <div className="beach-data-note">
      {zoneLabel && <p className="beach-local-time">{copy.localTime} {zoneLabel}</p>}
      <p>{copy.beachSource} <a target="_blank" rel="noreferrer noopener"
        href={`https://www.ipma.pt/pt/maritima/costeira/index.jsp?selLocal=${encodeURIComponent(beach.id)}&idLocal=${encodeURIComponent(beach.id)}`}>
        IPMA.pt{external}
      </a></p>
      {forecast?.airLocation && !isLocalAirForecast(beach, forecast) && <p className="beach-air-source">
        {copy.airForecastSource} {forecast.airLocation} · {formatDistance(forecast.airDistanceKm)}
      </p>}
    </div>
  )
}
