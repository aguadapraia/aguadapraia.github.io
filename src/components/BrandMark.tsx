import { useId, useState } from 'react'

const waveLine = `M-54 22c5-5 9-5 14 0${'s9 5 14 0 9-5 14 0'.repeat(3)}s9 5 14 0`

export default function BrandMark({ size = 32, animate = false }: { size?: number; animate?: boolean }) {
  const horizonId = useId()
  const windowId = useId()
  const [playing, setPlaying] = useState(false)
  function play() {
    if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(true)
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={playing ? 'brand-mark-playing' : undefined}
      style={{ display: 'block', flexShrink: 0 }}
      onPointerEnter={animate ? play : undefined}
      onPointerDown={animate ? play : undefined}
      onAnimationEnd={(event) => { if (event.animationName === 'brand-sun-drift') setPlaying(false) }}
    >
      <defs>
        <clipPath id={horizonId}><path className="brand-tide" d={`${waveLine}V0H-54Z`} /></clipPath>
        <clipPath id={windowId}><rect x="1" y="16" width="30" height="16" rx="1" /></clipPath>
      </defs>
      <g clipPath={`url(#${horizonId})`}>
        <g className="brand-sun" stroke="var(--cp-warning)" strokeWidth="2" strokeLinecap="round">
          <circle cx="16" cy="17" r="7" fill="var(--cp-warning)" />
          <path d="M16 3v3M6.5 7.5l2.1 2.1M25.5 7.5l-2.1 2.1M2 16h3M30 16h-3" />
        </g>
      </g>
      <g className="brand-wave" clipPath={`url(#${windowId})`} stroke="var(--cp-link)" strokeWidth="2" strokeLinecap="round">
        <path className="brand-tide" d={waveLine} />
        <g transform="translate(0 6)" opacity=".55"><path className="brand-tide" d={waveLine} /></g>
      </g>
    </svg>
  )
}
