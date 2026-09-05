import { useId } from 'react'

export default function BrandMark({ size = 32 }: { size?: number }) {
  const horizonId = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs><clipPath id={horizonId}>
        <path d="M0 0h32v20h-2C24 25 20 23 15 20C10 17 7 17 2 22H0Z" />
      </clipPath></defs>
      <g clipPath={`url(#${horizonId})`}>
        <g className="brand-sun" stroke="var(--cp-warning)" strokeWidth="2" strokeLinecap="round">
          <circle cx="16" cy="17" r="7" />
          <path d="M16 3v3M6.5 7.5l2.1 2.1M25.5 7.5l-2.1 2.1" />
        </g>
      </g>
      <g className="brand-wave" stroke="var(--cp-link)" strokeWidth="2" strokeLinecap="round">
        <path d="M2 22C7 17 10 17 15 20S24 25 30 20" />
        <path d="M2 28C7 23 10 23 15 26S24 31 30 26" opacity=".55" />
      </g>
    </svg>
  )
}
