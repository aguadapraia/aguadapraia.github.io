import type { WeatherKind } from '../lib/weather-symbol'

export default function WeatherSymbol({ kind }: { kind: WeatherKind }) {
  const cloud = !['clear', 'frost', 'unknown'].includes(kind)
  return (
    <svg x={-22} y={-14} width={25} height={28} viewBox="0 0 32 36" fill="none"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="weather-symbol">
      {(kind === 'clear' || kind === 'partial') && <g stroke="var(--cp-warning)" fill="var(--cp-bg-elevated)">
        <circle cx={kind === 'clear' ? 16 : 11} cy={kind === 'clear' ? 15 : 11} r="6" fill="var(--cp-warning)" fillOpacity=".18" />
        <path d={kind === 'clear' ? 'M16 4V1M16 26v3M5 15H2M27 15h3M8 7 6 5M24 23l2 2M24 7l2-2M8 23l-2 2' : 'M11 2V0M3 5 1 3M2 12H0M19 4l2-2'} />
      </g>}
      {cloud && <path d="M7 23a5 5 0 0 1-1-10 8 8 0 0 1 15-2 6 6 0 1 1 3 12Z"
        fill="var(--cp-surface)" stroke="var(--cp-map-line)" />}
      {kind === 'rain' && <path d="m9 27-2 5m10-5-2 5m10-5-2 5" stroke="var(--cp-link)" />}
      {kind === 'storm' && <path d="m16 24-5 7h5l-3 5 10-9h-6l2-3" stroke="var(--cp-orange)" fill="var(--cp-warning)" />}
      {kind === 'fog' && <path d="M3 26h18m-12 5h20M24 26h5M2 31h3" stroke="var(--cp-map-line)" />}
      {kind === 'snow' && <g stroke="var(--cp-cool-blue)"><path d="M9 26v8m-4-4h8m-7-3 6 6m0-6-6 6M24 27v6m-3-3h6" /></g>}
      {kind === 'hail' && <g fill="var(--cp-cool-blue)"><circle cx="7" cy="29" r="2" /><circle cx="16" cy="32" r="2" /><circle cx="25" cy="28" r="2" /></g>}
      {kind === 'frost' && <path d="M16 5v24M6 11l20 12M6 23l20-12M12 7l4 4 4-4M12 27l4-4 4 4M4 15l6-1-1-6M23 28l-1-6 6-1M4 19l6 1-1 6M23 8l-1 6 6 1"
        stroke="var(--cp-cool-blue)" />}
      {kind === 'unknown' && <g stroke="var(--cp-text-muted)"><circle cx="16" cy="17" r="11" /><path d="M12 13a4 4 0 1 1 6 4l-2 2m0 5v.1" /></g>}
    </svg>
  )
}
