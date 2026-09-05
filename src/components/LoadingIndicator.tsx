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
        <svg viewBox="0 0 192 12" width="192" height="12">
          <path d="M0 6q12-8 24 0t24 0t24 0t24 0t24 0t24 0t24 0t24 0"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      {label && <span className="loading-label">{label}</span>}
    </div>
  )
}
