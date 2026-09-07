import BrandMark from './BrandMark'

interface LoadingIndicatorProps {
  variant?: 'full' | 'compact'
  label?: string
}

export default function LoadingIndicator({
  variant = 'full',
  label,
}: LoadingIndicatorProps) {
  return (
    <div
      className={`loading-indicator loading-indicator--${variant}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="loading-brand" aria-hidden="true">
        <BrandMark size={variant === 'full' ? 56 : 34} />
      </span>
      <span className="loading-progress" aria-hidden="true">
        <span className="loading-progress-motion">
          <svg viewBox="0 0 240 12" width="240" height="12" preserveAspectRatio="none">
            <path className="loading-progress-wave loading-progress-wave--back"
              d="M-48 5q12 4 24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0V12H-48Z" />
            <path className="loading-progress-wave"
              d="M-48 7q12-4 24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0V12H-48Z" />
          </svg>
        </span>
      </span>
      {label && <span className="loading-label">{label}</span>}
    </div>
  )
}
