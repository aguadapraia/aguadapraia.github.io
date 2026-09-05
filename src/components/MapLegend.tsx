import { getCopy, type Language } from '../i18n'
import { convertWind, type WindUnit } from '../lib/units'
import type { MapMetric } from '../types'

interface MapLegendProps {
  language: Language
  metric: MapMetric
  windUnit: WindUnit
}

export default function MapLegend({ language, metric, windUnit }: MapLegendProps) {
  const copy = getCopy(language)
  if (metric === 'wind') {
    const maximum = convertWind(20, windUnit)
    const maximumLabel =
      windUnit === 'kmh' ? `${maximum.toFixed(0)}+` : `${maximum}+`
    const unit = windUnit === 'kmh' ? 'km/h' : 'kn'
    return (
      <div className="water-temperature-legend map-legend map-legend--wind" aria-label={copy.windScale}>
        <span>{language === 'pt' ? 'Fraco' : 'Light'} · 0</span>
        <i className="legend-scale" />
        <span>{maximumLabel} · {language === 'pt' ? 'Forte' : 'Strong'}</span>
        <b>{unit} {copy.wind}</b>
      </div>
    )
  }

  const bounds = metric === 'water' ? ['16°', '24°+'] : ['18°', '33°+']
  return (
    <div
      className="water-temperature-legend map-legend"
      aria-label={`${copy.temperatureScale}: ${metric === 'water' ? copy.water : copy.air}`}
    >
      <span>{bounds[0]}</span>
      <i className="legend-scale" />
      <span>{bounds[1]}</span>
      <b>°C {metric === 'water' ? copy.water : copy.air}</b>
    </div>
  )
}
