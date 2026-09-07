import { useMemo, useState, type CSSProperties } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getCopy, type Language } from '../i18n'
import {
  chartLineReadings, chartLineStatistics, chartReadingRange, DEFAULT_CHART_VISIBILITY,
  visibleChartReadings, visibleChartStatistics, type ChartReadings, type ChartStatistic,
} from '../lib/chart-visibility'
import { resolveHistoryPeriod } from '../lib/history-period'
import { formatChartDate } from '../lib/relative-date'
import { convertWind, type WindUnit } from '../lib/units'
import type { DailyBeachForecast, HistoryPoint, MapMetric } from '../types'
import ChartSeriesLegend from './ChartSeriesLegend'
import './metric-history-chart.css'

interface ChartPoint extends ChartReadings {
  date: string
  kind?: 'history' | 'forecast'
  [key: string]: string | number | number[] | undefined
}

function finite(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? value : undefined
}

export default function MetricHistoryChart({
  history, forecasts, language, windUnit, metric,
}: {
  history: HistoryPoint[]
  forecasts: DailyBeachForecast[]
  language: Language
  windUnit: WindUnit
  metric: MapMetric
}) {
  const copy = getCopy(language)
  const suffix = metric === 'wind' ? windUnit === 'kmh' ? 'km/h' : 'kn' : '°C'
  const colour = `var(--metric-${metric})`
  const [visibility, setVisibility] = useState(DEFAULT_CHART_VISIBILITY)
  const statistics = useMemo<ChartStatistic[]>(() => metric === 'wind' ? ['max', 'min', 'avg'] : ['max', 'min'], [metric])
  const enabledStatistics = visibleChartStatistics(visibility, statistics)
  const rawData = useMemo(() => {
    const points = new Map<string, ChartPoint>()
    const readWind = (value: number | undefined) => value === undefined ? undefined : convertWind(value, windUnit)
    function add(point: HistoryPoint | DailyBeachForecast, kind: 'history' | 'forecast') {
      const min = finite(metric === 'water' ? point.waterMin : metric === 'air' ? point.airMin : readWind(point.windMinKnots))
      const max = finite(metric === 'water' ? point.waterMax : metric === 'air' ? point.airMax : readWind(point.windMaxKnots))
      const avg = metric === 'wind' ? finite(readWind(point.windAverageKnots)) : undefined
      points.set(point.date, { date: point.date, min, max, avg, kind })
    }
    history.filter((point) => point.kind === 'history').forEach((point) => add(point, 'history'))
    forecasts.forEach((point) => add(point, 'forecast'))
    const dates = [...points.keys()].sort()
    const period = resolveHistoryPeriod(dates[0] ?? '', dates.at(-1) ?? '', dates)
    if (!period) return []
    return period.calendarDates.map<ChartPoint>((date) => points.get(date) ?? { date })
  }, [history, forecasts, metric, windUnit])
  const data = useMemo(() => {
    const lineStatistics = chartLineStatistics(visibility, statistics)
    const projected = rawData.map<ChartPoint>((point) => {
      if (!point.kind) return { date: point.date }
      const readings = visibleChartReadings(point, visibility, statistics, point.kind)
      const row: ChartPoint = { date: point.date, kind: point.kind, ...readings }
      row[`${point.kind}_range`] = chartReadingRange(readings)
      return row
    })
    projected.forEach((point, index) => {
      if (!point.kind) return
      const rangeKey = `${point.kind}_range`
      const adjacentRange = Array.isArray(projected[index - 1]?.[rangeKey]) || Array.isArray(projected[index + 1]?.[rangeKey])
      const readings = chartLineReadings(point, lineStatistics, adjacentRange)
      for (const statistic of statistics) point[`${point.kind}_${statistic}_line`] = readings[statistic]
    })
    // The calendar includes empty days, so only adjacent publications can join.
    projected.forEach((point, index) => {
      const previous = projected[index - 1]
      if (point.kind !== 'forecast' || previous?.kind !== 'history') return
      for (const statistic of statistics) {
        if (typeof point[`forecast_${statistic}_line`] === 'number' && typeof previous[`history_${statistic}_line`] === 'number') {
          previous[`forecast_${statistic}_line`] = previous[`history_${statistic}_line`]
        }
      }
    })
    return projected
  }, [rawData, statistics, visibility])
  const values = data.flatMap((point) => enabledStatistics
    .map((statistic) => point[statistic]).filter((value): value is number => value !== undefined))
  const padding = metric === 'wind' ? 2 : 1
  const low = values.length ? Math.floor(values.reduce((min, value) => Math.min(min, value), Infinity) - padding) : 0
  const high = values.length ? Math.ceil(values.reduce((max, value) => Math.max(max, value), -Infinity) + padding) : 1
  const kinds = (['history', 'forecast'] as const).filter((kind) => kind === 'history' || visibility.forecast)
  const showForecast = rawData.some((point) => point.kind === 'forecast')
  const hidden = !enabledStatistics.length || (!visibility.forecast && !rawData.some((point) => point.kind === 'history'))
  const labels = { max: copy.maximum, min: copy.minimum, avg: copy.average, value: '' }
  const help = language === 'pt'
    ? 'Ativa ou oculta séries. A faixa requer Mín. e Máx. O histórico contém previsões guardadas; a linha tracejada mostra as atuais.'
    : 'Show or hide series. The band requires Min. and Max. History contains saved forecasts; the dashed line shows current forecasts.'
  const dateLabel = (date: string, full = false) => formatChartDate(date, language, full)

  return (
    <div className="beach-history-chart metric-history-chart" style={{ '--chart-colour': colour } as CSSProperties}>
      <div className="beach-history-canvas" role="img" aria-label={`${copy.history}: ${copy[metric]}`}>
        {values.length ? <ResponsiveContainer width="100%" height="100%">
          <ComposedChart accessibilityLayer data={data} margin={{ top: 10, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--cp-border)" vertical={false} strokeDasharray="3 5" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={32}
              tickFormatter={(date: string) => dateLabel(date)} tick={{ fill: 'var(--cp-text-muted)', fontSize: 11 }} />
            <YAxis domain={[metric === 'wind' ? Math.max(0, low) : low, high]} width={42}
              axisLine={false} tickLine={false} tickCount={4} tick={{ fill: 'var(--cp-text-muted)', fontSize: 11 }} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const point: ChartPoint = payload[0].payload
              if (!point.kind || (point.kind === 'forecast' && !visibility.forecast)) return null
              const readings = visibleChartReadings(point, visibility, statistics, point.kind)
              return <div className="chart-tooltip">
                <strong>{dateLabel(String(label), true)}</strong>
                <small>{point.kind === 'forecast' ? copy.forecast : copy.historyLabel}</small>
                {enabledStatistics.map((statistic) => <span key={statistic}>{labels[statistic]}
                  <b>{readings[statistic] === undefined ? '—' : `${readings[statistic].toFixed(1)} ${suffix}`}</b>
                </span>)}
              </div>
            }} />
            {visibility.min && visibility.max && kinds.map((kind) => <Area key={`${kind}-range`} dataKey={`${kind}_range`}
              type="linear" connectNulls={false} stroke="none" fill={colour} fillOpacity={kind === 'history' ? 0.13 : 0.06}
              activeDot={false} isAnimationActive={false} />)}
            {enabledStatistics.flatMap((statistic) => kinds.map((kind) => {
              const key = `${kind}_${statistic}_line`
              return <Line key={key} dataKey={key} type="linear" connectNulls={false} stroke={colour}
                strokeWidth={statistic === 'min' ? 1.6 : 2.3} strokeDasharray={kind === 'forecast' ? '5 4' : statistic === 'min' ? '2 3' : undefined}
                dot={(props) => {
                  const index = props.index ?? 0
                  const isolated = typeof data[index - 1]?.[key] !== 'number' && typeof data[index + 1]?.[key] !== 'number'
                  return isolated && typeof data[index]?.[key] === 'number'
                    ? <circle key={`${key}-${index}`} cx={props.cx} cy={props.cy} r={2.5} fill={colour} strokeWidth={0} />
                    : <g key={`${key}-${index}`} />
                }} activeDot={{ r: 4, fill: colour }} isAnimationActive={false} />
            }))}
          </ComposedChart>
        </ResponsiveContainer> : <div className="metric-history-empty" role="status">
          {hidden
            ? language === 'pt' ? 'Ativa uma série na legenda.' : 'Enable a series in the legend.'
            : language === 'pt' ? 'Sem valores para estas séries.' : 'No values for these series.'}
        </div>}
      </div>
      <ChartSeriesLegend language={language} visibility={visibility} statistics={statistics} showForecast={showForecast}
        help={help} onToggle={(key) => setVisibility((value) => ({ ...value, [key]: !value[key] }))} />
    </div>
  )
}
