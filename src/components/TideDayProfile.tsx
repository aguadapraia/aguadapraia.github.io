import { useId } from 'react'
import { getCopy, type Language } from '../i18n'
import type { TideDay } from '../lib/tide-day'

export default function TideDayProfile({ day, language }: { day: TideDay; language: Language }) {
  const copy = getCopy(language)
  const id = useId()
  const first = Math.min(day.start, day.events[0].timestamp)
  const last = Math.max(day.end, day.events.at(-1)!.timestamp)
  const x = (time: number) => 32 + (time - first) / (last - first) * 296
  // Two symbolic levels, never a scale or interpolation of the source heights.
  const y = (kind: 'high' | 'low') => kind === 'high' ? 38 : 86
  const eventLabel = (kind: 'high' | 'low') => kind === 'low' ? copy.lowTide : copy.highTide
  const description = [
    ...day.events.map((event) => `${event.label}: ${eventLabel(event.kind)}`),
    ...day.periods.map((period) => `${period.startLabel}–${period.endLabel}: ${
      period.direction === 'rising' ? copy.tideRising : period.direction === 'falling' ? copy.tideFalling : copy.tideUnknown
    }`),
  ].join('. ')
  return (
    <figure className="tide-profile">
      <div className="tide-profile-plot">
        <svg viewBox="0 0 360 140" role="img" aria-label={copy.tides} aria-describedby={`${id}-description`}>
          <desc id={`${id}-description`}>{description}</desc>
          <rect className="tide-profile-window" x={x(day.start)} y="2" width={x(day.end) - x(day.start)} height="120" rx="8" />
          {day.events.slice(0, -1).map((event, index) => {
            const next = day.events[index + 1]
            const fromX = x(event.timestamp), toX = x(next.timestamp)
            const fromY = y(event.kind), toY = y(next.kind)
            const angle = Math.atan2(toY - fromY, toX - fromX) * 180 / Math.PI
            return <g key={event.timeUtc} className="tide-profile-connection">
              <line x1={fromX} y1={fromY} x2={toX} y2={toY} vectorEffect="non-scaling-stroke" />
              <path d="M -3 -4 L 1 0 L -3 4"
                transform={`translate(${(fromX + toX) / 2} ${(fromY + toY) / 2}) rotate(${angle})`}
                vectorEffect="non-scaling-stroke" />
            </g>
          })}
          {day.events.map((event) => <g key={event.timeUtc} className="tide-profile-event" data-daytime={event.inDaytime} data-tide={event.kind}>
            <circle cx={x(event.timestamp)} cy={y(event.kind)} r="6" vectorEffect="non-scaling-stroke" />
          </g>)}
        </svg>
        <div className="tide-profile-labels" aria-hidden="true">
          {day.events.map((event) => <time key={event.timeUtc} dateTime={event.timeUtc}
            className="tide-profile-time" data-daytime={event.inDaytime}
            style={{ left: `${x(event.timestamp) / 360 * 100}%`, top: `${(event.kind === 'high' ? 14 : 108) / 140 * 100}%` }}>
            {event.label}
          </time>)}
          <span className="tide-profile-window-label" style={{ left: `${x(day.start) / 360 * 100}%` }}>08h</span>
          <span className="tide-profile-window-label" style={{ left: `${x(day.end) / 360 * 100}%` }}>18h</span>
        </div>
      </div>
      <figcaption className="tide-profile-legend" aria-hidden="true">
        {(['low', 'high'] as const).map((kind) => <span key={kind}>
          <svg viewBox="0 0 16 16" className="tide-profile-symbol" data-tide={kind}><circle cx="8" cy="8" r="5" /></svg>
          {eventLabel(kind)}
        </span>)}
      </figcaption>
    </figure>
  )
}
