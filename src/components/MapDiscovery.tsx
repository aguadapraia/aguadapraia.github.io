import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Droplets, LocateFixed, Search, ThermometerSun, Wind, X } from 'lucide-react'
import { getCopy, type Language } from '../i18n'
import { forecastForDate, forecastHighlights, nearestBeach } from '../lib/beach-discovery'
import { normalizeBeachSearch } from '../lib/beach-search'
import { formatWind, type WindUnit } from '../lib/units'
import type { BeachViewModel, MapMetric, TerritoryFilter } from '../types'

interface MapDiscoveryProps {
  beaches: BeachViewModel[]
  activeDate: string
  territory: TerritoryFilter
  language: Language
  windUnit: WindUnit
  metric: MapMetric
  selectedBeach?: BeachViewModel
  controls: ReactNode
  children?: ReactNode
  onMetricChange: (metric: MapMetric) => void
  onSelect: (beach: BeachViewModel) => void
  onClearSelection: () => void
}

export default function MapDiscovery({
  beaches, activeDate, territory, language, windUnit, metric,
  selectedBeach, controls, children, onMetricChange, onSelect, onClearSelection,
}: MapDiscoveryProps) {
  const copy = getCopy(language)
  const pt = language === 'pt'
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeResult, setActiveResult] = useState(-1)
  const [locating, setLocating] = useState(false)
  const [locationMessage, setLocationMessage] = useState('')
  const requestId = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => () => { requestId.current += 1 }, [])
  useEffect(() => {
    requestId.current += 1
    setLocating(false)
    setLocationMessage('')
    setQuery(selectedBeach?.name ?? '')
    setSearchOpen(false)
    setActiveResult(-1)
    bodyRef.current?.scrollTo({ top: 0 })
  }, [selectedBeach?.id, selectedBeach?.name, territory])
  const scope = useMemo(() => territory === 'all' ? beaches
    : beaches.filter((beach) => beach.territory === territory), [beaches, territory])
  const highlights = useMemo(() => forecastHighlights(scope, activeDate), [scope, activeDate])
  const normalizedQuery = normalizeBeachSearch(query)
  const matches = useMemo(() => normalizedQuery ? beaches.filter((beach) =>
    normalizeBeachSearch(`${beach.name} ${beach.municipality} ${beach.district}`).includes(normalizedQuery),
  ).slice(0, 8) : [], [beaches, normalizedQuery])
  const expanded = searchOpen && Boolean(normalizedQuery)
  const metricOptions = [
    { value: 'water', label: copy.water, icon: Droplets },
    { value: 'air', label: copy.air, icon: ThermometerSun },
    { value: 'wind', label: copy.wind, icon: Wind },
  ] as const

  function chooseBeach(beach: BeachViewModel) {
    requestId.current += 1
    setLocating(false)
    setLocationMessage('')
    setQuery(beach.name)
    setSearchOpen(false)
    setActiveResult(-1)
    onSelect(beach)
  }

  function clearSelection() {
    requestId.current += 1
    setLocating(false)
    setLocationMessage('')
    setQuery('')
    setActiveResult(-1)
    setSearchOpen(false)
    onClearSelection()
    searchRef.current?.focus()
  }

  function locate() {
    if (!navigator.geolocation) {
      setLocationMessage(pt ? 'A localização não está disponível. Pesquisa uma praia pelo nome.' : 'Location is unavailable. Search for a beach by name.')
      return
    }
    const id = ++requestId.current
    setLocating(true)
    setLocationMessage('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (id !== requestId.current) return
        setLocating(false)
        const beach = nearestBeach(beaches, position.coords.latitude, position.coords.longitude)
        if (beach) chooseBeach(beach)
        else setLocationMessage(pt ? 'Não há praias disponíveis.' : 'No beaches are available.')
      },
      (error) => {
        if (id !== requestId.current) return
        setLocating(false)
        setLocationMessage(error.code === 1
          ? (pt ? 'Localização não autorizada. Podes pesquisar pelo nome.' : 'Location permission was denied. You can search by name.')
          : (pt ? 'Não foi possível localizar-te. Tenta novamente ou pesquisa uma praia.' : 'Unable to locate you. Try again or search for a beach.'))
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  return (
    <section className={`beach-discovery${selectedBeach ? ' has-selection' : ''}`} aria-label={pt ? 'Explorar praias' : 'Explore beaches'}>
      <h1 className="sr-only">{pt ? 'Praias de Portugal' : 'Beaches of Portugal'}</h1>
      <div className="beach-sidebar-header">
      <div className="beach-discovery-search" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false)
      }}>
        <div className="beach-search-field">
          <Search size={18} aria-hidden="true" />
          <input
            ref={searchRef}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls="discovery-results"
            aria-activedescendant={expanded && matches[activeResult] ? `discovery-result-${activeResult}` : undefined}
            aria-label={copy.search}
            placeholder={pt ? 'Procura uma praia ou escolhe no mapa' : 'Find a beach or select on the map'}
            value={query}
            onFocus={(event) => {
              if (selectedBeach && query === selectedBeach.name) event.currentTarget.select()
              else setSearchOpen(true)
            }}
            onChange={(event) => {
              requestId.current += 1
              setLocating(false)
              setQuery(event.target.value)
              setActiveResult(-1)
              setSearchOpen(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                if (expanded) { setSearchOpen(false); setActiveResult(-1) }
                else if (selectedBeach) clearSelection()
              } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length) {
                event.preventDefault()
                setSearchOpen(true)
                setActiveResult((current) => event.key === 'ArrowDown'
                  ? (current + 1) % matches.length
                  : (current <= 0 ? matches.length - 1 : current - 1))
              } else if (event.key === 'Enter' && expanded) {
                const beach = matches[Math.max(0, activeResult)]
                if (beach) { event.preventDefault(); chooseBeach(beach) }
              }
            }}
          />
          {(query || selectedBeach) && <button type="button" aria-label={copy.clear} onClick={clearSelection}><X size={16} /></button>}
          <button type="button" onClick={locate} disabled={locating}
            aria-label={locating ? (pt ? 'A localizar…' : 'Locating…') : (pt ? 'Perto de mim' : 'Near me')}
            title={pt ? 'Praia mais próxima · localização apenas neste dispositivo' : 'Nearest beach · location stays on this device'}>
            <LocateFixed size={18} />
          </button>
        </div>
        {expanded && <div className="beach-search-results">
          <div role="listbox" id="discovery-results" aria-label={copy.results}>
            {matches.map((beach, index) => {
              const water = forecastForDate(beach, activeDate)?.waterMax
              return <button key={beach.id} id={`discovery-result-${index}`}
                role="option" aria-selected={activeResult === index} tabIndex={-1}
                type="button" onClick={() => chooseBeach(beach)}>
                <span><strong>{beach.name}</strong><small>{beach.municipality} · {beach.district}</small></span>
                <b>{Number.isFinite(water) ? `${water?.toFixed(1)}°` : '—'}</b>
              </button>
            })}
          </div>
          {matches.length === 0 && <p role="status">{pt
            ? 'Não encontrámos essa praia. Tenta o nome do concelho ou distrito.'
            : 'No matching beach. Try a municipality or district.'}</p>}
        </div>}
      </div>
      {controls}
      {locationMessage && <p role="status" className="beach-location-message">{locationMessage}</p>}
      </div>
      <div className="beach-sidebar-body" ref={bodyRef}>
      {selectedBeach ? children : <>
      <section className="beach-highlights" aria-label={pt ? 'Destaques do dia' : 'Daily highlights'}>
        <h2 title={pt
          ? 'Concelhos distintos; repetimos um concelho apenas com mais de 1 °C de diferença. O catálogo não inclui freguesias.'
          : 'Different municipalities; repeated only with more than 1 °C difference. Parish data is not available.'}>
          {pt ? 'Destaques' : 'Highlights'}<span>{scope.length} {pt ? 'praias' : 'beaches'}</span>
        </h2>
        <div className="beach-highlight-cards" id="discovery-highlights">
          {metricOptions.map(({ value, label, icon: Icon }) => {
            const items = highlights[value]
            if (!items.length) return null
            const heading = value === 'water' ? copy.warmestWater : value === 'air' ? copy.hottestAir : copy.calmestWind
            return <section key={value} className={`beach-highlight-group beach-highlight-${value}`} aria-label={heading}>
              <h3><Icon size={17} aria-hidden="true" />
                <span className="highlight-desktop-label">{heading}</span>
                <span className="highlight-mobile-label" title={heading}>{label}</span>
              </h3>
              {items.map((item) => <button type="button" key={item.beach.id}
                title={`${item.beach.name} · ${item.beach.municipality}`} onClick={() => chooseBeach(item.beach)}>
                <span><strong>{item.beach.name}</strong><small>{item.beach.municipality}</small></span>
                <b>{value === 'wind' ? formatWind(item.value, windUnit) : `${item.value.toFixed(value === 'water' ? 1 : 0)}°`}</b>
              </button>)}
            </section>
          })}
        </div>
      </section>

      <div className="beach-discovery-tools">
        <div className="beach-map-metric">
          <span>{pt ? 'Ver o mapa por' : 'View the map by'}</span>
          <div className="seg-control" role="group" aria-label={copy.mapMetric}>
            {metricOptions.map(({ value, label, icon: Icon }) => (
              <button key={value} type="button" aria-pressed={metric === value}
                className={`metric-tab--${value} ${metric === value ? 'active' : ''}`}
                title={value === 'wind' ? (pt ? 'Média das 08:00 às 18:00' : 'Average from 08:00 to 18:00') : (pt ? 'Máxima diária' : 'Daily maximum')}
                onClick={() => onMetricChange(value)}><Icon size={16} />{label}</button>
            ))}
          </div>
        </div>
      </div>
      </>}
      </div>
    </section>
  )
}
