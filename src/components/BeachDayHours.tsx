import { useEffect, useState } from 'react'
import { ArrowUp, Clock3 } from 'lucide-react'
import { loadBeachDayDetail } from '../data/api'
import { getCopy, type Language } from '../i18n'
import { daytimeReadings, hasHourlyAir } from '../lib/daytime-hours'
import { convertWind, type WindUnit } from '../lib/units'
import { windDirectionDegrees } from '../lib/wind-direction'
import type { BeachDayDetail } from '../types'
import LoadingIndicator from './LoadingIndicator'

const DAYTIME_HOURS = Array.from({ length: 11 }, (_, index) => index + 8)

export default function BeachDayHours({
  beachId, date, language, windUnit, layout = 'vertical',
}: {
  beachId: string
  date: string
  language: Language
  windUnit: WindUnit
  layout?: 'vertical' | 'compact'
}) {
  const [open, setOpen] = useState(true)
  const [detail, setDetail] = useState<BeachDayDetail | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const copy = getCopy(language)
  const shouldLoad = layout === 'compact' || open
  const windSuffix = windUnit === 'kmh' ? 'km/h' : 'kn'
  const directionHint = language === 'pt' ? 'Origem do vento; seta no sentido em que sopra' : 'Wind origin; arrow points downwind'
  const missingLabel = language === 'pt' ? 'Sem dados' : 'No data'
  const dailyAirHint = language === 'pt' ? 'mín–máx diária · sem dados horários' : 'daily min–max · no hourly data'

  useEffect(() => {
    setDetail(null)
    setError(false)
    if (!shouldLoad || !date) return
    let active = true
    loadBeachDayDetail(beachId, date)
      .then((result) => { if (active) setDetail(result) })
      .catch((reason: unknown) => {
        if (!active) return
        console.warn('Hourly forecast loading failed:', reason)
        setError(true)
      })
    return () => { active = false }
  }, [beachId, date, shouldLoad, attempt])

  const currentDetail = detail?.beachId === beachId && detail.date === date ? detail : null
  const readings = currentDetail ? daytimeReadings(currentDetail.hourly) : []
  const hourlyAir = hasHourlyAir(readings)
  const hoursLabel = `08–18h${currentDetail?.hourlyTimeZone ? ` ${currentDetail.hourlyTimeZone}` : ''}`
  const readingsByHour = new Map(readings.map((reading) => [reading.hour, reading]))
  const missingValue = <span aria-label={missingLabel} title={missingLabel}>—</span>
  const formatValue = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(1)
    : missingValue
  const formatWind = (value: number | null | undefined) => formatValue(
    typeof value === 'number' ? convertWind(value, windUnit) : undefined,
  )
  const renderDirection = (value: string | null | undefined) => {
    const direction = windDirectionDegrees(value)
    return (
      <span className="beach-direction">
        {direction !== null && <ArrowUp size={15} style={{ transform: `rotate(${direction + 180}deg)` }} aria-hidden="true" />}
        {value || missingValue}
      </span>
    )
  }
  const content = !date ? <p>{copy.noHourlyData}</p> : error ? (
    <div className="beach-inline-error" role="alert">
      <p>{copy.detailUnavailable}</p>
      <button type="button" onClick={() => setAttempt((current) => current + 1)}>{copy.retry}</button>
    </div>
  ) : !detail ? (
    <LoadingIndicator variant="compact" label={copy.loading} />
  ) : layout === 'compact' ? (
    <>
      {!hourlyAir && <div className="beach-hourly-air">
        <span>{copy.airTemperature}</span>
        <span className="beach-hourly-air-range">
          {currentDetail?.air
            ? <>{formatValue(currentDetail.air.minimumCelsius)}–{formatValue(currentDetail.air.maximumCelsius)} °C</>
            : missingValue}
        </span>
        <small>{dailyAirHint}</small>
      </div>}
      {readings.length === 0 ? <p>{copy.noHourlyData}</p> : (
        <div className="beach-hourly-scroll" tabIndex={0} role="region" aria-label={`${copy.hourlyTitle} · ${date}`}>
          <table className="beach-hourly-matrix">
            <caption className="sr-only">{copy.hourlyTitle} · {date}</caption>
            <thead>
              <tr>
                <th scope="col">{copy.time}</th>
                {DAYTIME_HOURS.map((hour) => <th scope="col" key={hour}>{String(hour).padStart(2, '0')}:00</th>)}
              </tr>
            </thead>
            <tbody>
              {hourlyAir && <tr className="beach-hourly-air-values">
                <th scope="row">{copy.air} °C</th>
                {DAYTIME_HOURS.map((hour) => <td key={hour}>{formatValue(readingsByHour.get(hour)?.airTemperatureCelsius)}</td>)}
              </tr>}
              <tr className="beach-hourly-water">
                <th scope="row">{copy.water} °C</th>
                {DAYTIME_HOURS.map((hour) => <td key={hour}>{formatValue(readingsByHour.get(hour)?.waterTemperatureCelsius)}</td>)}
              </tr>
              <tr className="beach-hourly-wind">
                <th scope="row">{copy.wind} {windSuffix}</th>
                {DAYTIME_HOURS.map((hour) => <td key={hour}>{formatWind(readingsByHour.get(hour)?.windKnots)}</td>)}
              </tr>
              <tr className="beach-hourly-wind">
                <th scope="row" title={directionHint}>{copy.direction}</th>
                {DAYTIME_HOURS.map((hour) => <td key={hour}>{renderDirection(readingsByHour.get(hour)?.windDirection)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  ) : readings.length === 0 ? <p>{copy.noHourlyData}</p> : (
    <table>
      <caption className="sr-only">{copy.hourlyTitle} · {date}</caption>
      <thead><tr>
        <th scope="col">{copy.time}</th>
        {hourlyAir && <th scope="col">{copy.air} °C</th>}
        <th scope="col">{copy.water} °C</th>
        <th scope="col">{copy.wind} {windSuffix}</th>
        <th scope="col" title={directionHint}>{copy.direction}</th>
      </tr></thead>
      <tbody>{readings.map((reading) => (
        <tr key={reading.hour}>
          <th scope="row">{String(reading.hour).padStart(2, '0')}:00</th>
          {hourlyAir && <td>{formatValue(reading.airTemperatureCelsius)}</td>}
          <td>{formatValue(reading.waterTemperatureCelsius)}</td>
          <td>{formatWind(reading.windKnots)}</td>
          <td>{renderDirection(reading.windDirection)}</td>
        </tr>
      ))}</tbody>
    </table>
  )

  if (layout === 'compact') {
    return (
      <section className="beach-hourly beach-hourly-compact" aria-label={`${copy.hourlyTitle} · ${date}`}>
        <h4><Clock3 size={15} aria-hidden="true" />{copy.hourlyTitle}<small>{hoursLabel}</small></h4>
        {content}
      </section>
    )
  }

  return (
    <details className="beach-hourly" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <Clock3 size={16} aria-hidden="true" />
        {copy.hourlyTitle}
        <small>{hoursLabel}</small>
      </summary>
      {open && content}
    </details>
  )
}
