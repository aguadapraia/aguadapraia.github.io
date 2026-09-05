import { useId } from 'react'
import { getCopy, type Language } from '../i18n'
import { type ChartStatistic, type ChartVisibility, type ChartVisibilityKey } from '../lib/chart-visibility'
import './chart-series-legend.css'

export default function ChartSeriesLegend({
  language, visibility, statistics, showForecast, onToggle, help,
}: {
  language: Language
  visibility: ChartVisibility
  statistics: readonly ChartStatistic[]
  showForecast: boolean
  onToggle: (key: ChartVisibilityKey) => void
  help?: string
}) {
  const copy = getCopy(language)
  const helpId = useId()
  const labels = language === 'pt'
    ? { max: 'Máx.', min: 'Mín.', avg: 'Média', value: 'Hora a hora', forecast: 'Previsão' }
    : { max: 'Max.', min: 'Min.', avg: 'Average', value: 'Hourly', forecast: 'Forecast' }
  const keys: ChartVisibilityKey[] = [...statistics, ...(showForecast ? ['forecast' as const] : [])]
  return (
    <div className="chart-series-legend" role="group" aria-label={copy.toggleSeriesVisibility} aria-describedby={help ? helpId : undefined}>
      {keys.map((key) => <button key={key} type="button" data-series={key}
        aria-pressed={visibility[key]} onClick={() => onToggle(key)}>
        <i aria-hidden="true" />{labels[key]}
      </button>)}
      {help && <span className="chart-series-help" id={helpId}>{help}</span>}
    </div>
  )
}
