import { ChevronDown } from 'lucide-react'
import { getCopy, type Language } from '../i18n'
import type { TerritoryFilter } from '../types'

interface TerritorySelectProps {
  value: TerritoryFilter
  language: Language
  onChange: (value: TerritoryFilter) => void
  className?: string
  elevated?: boolean
}

function isTerritoryFilter(value: string): value is TerritoryFilter {
  return value === 'all' || value === 'mainland' || value === 'madeira' || value === 'azores'
}

export default function TerritorySelect({
  value,
  language,
  onChange,
  className = '',
  elevated = false,
}: TerritorySelectProps) {
  const copy = getCopy(language)

  return (
    <div className={`territory-select-wrapper${elevated ? ' territory-select-wrapper--elevated' : ''}${className ? ` ${className}` : ''}`}>
      <select
        value={value}
        aria-label={copy.region}
        onChange={(event) => {
          const nextValue = event.target.value
          if (isTerritoryFilter(nextValue)) {
            onChange(nextValue)
          }
        }}
      >
        <option value="all">{copy.portugal}</option>
        <option value="mainland">{copy.mainland}</option>
        <option value="madeira">{copy.madeira}</option>
        <option value="azores">{copy.azores}</option>
      </select>
      <ChevronDown size={14} aria-hidden="true" className="territory-select-chevron" />
    </div>
  )
}
