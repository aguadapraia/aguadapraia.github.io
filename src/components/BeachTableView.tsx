import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Droplets, History, Map, Search, ThermometerSun, Wind, X } from 'lucide-react'
import { getCopy, type Language } from '../i18n'
import { convertWind, formatDistance, type WindUnit } from '../lib/units'
import {
  defaultSortState,
  filterBeaches,
  getTableForecast,
  hasTableValue,
  reconcileLocationFilters,
  sortBeaches,
  toggleSort,
  type SortKey,
  type TableSortState,
} from '../lib/beach-table'
import { Button } from './ui/button'
import BeachDayHours from './BeachDayHours'
import type { BeachViewModel } from '../types'
import './beach-table.css'

interface BeachTableViewProps {
  beaches: BeachViewModel[]
  activeDate: string
  language: Language
  windUnit: WindUnit
  onSelect: (beach: BeachViewModel) => void
  onExploreHistory?: (beach: BeachViewModel) => void
  forecastControl?: ReactNode
  territoryControl?: ReactNode
}

const TABLE_COPY = {
  pt: {
    searchPlaceholder: 'Praia, distrito ou concelho',
    allDistricts: 'Distrito: todos',
    allMunicipalities: 'Concelho: todos',
    noDate: 'Data indisponível',
    count: (shown: number, total: number) => shown === total ? `${total} praias` : `${shown} / ${total} praias`,
    water: 'Água',
    air: 'Ar',
    wind: 'Vento',
    min: 'Mín.',
    max: 'Máx.',
    average: 'Média',
    airStation: 'Estação da previsão do ar',
    ascending: 'crescente',
    descending: 'decrescente',
    sortBy: 'Ordenar por',
    sortLabels: {
      name: 'Praia', district: 'Distrito', municipality: 'Concelho',
      waterMin: 'Água mínima', waterMax: 'Água máxima',
      airMin: 'Ar mínimo', airMax: 'Ar máximo', windAvg: 'Vento médio',
    },
    expand: 'Ver detalhes de',
    collapse: 'Fechar detalhes de',
    map: 'Ver no mapa',
    history: 'Ver histórico',
    missing: 'Sem dados para esta data',
    noResults: 'Nenhuma praia corresponde aos filtros',
    noResultsHint: 'Experimenta outro nome ou limpa os filtros.',
    noBeaches: 'Sem praias disponíveis',
    noBeachesHint: 'Tenta novamente mais tarde.',
  },
  en: {
    searchPlaceholder: 'Beach, district or municipality',
    allDistricts: 'District: all',
    allMunicipalities: 'Municipality: all',
    noDate: 'Date unavailable',
    count: (shown: number, total: number) => shown === total ? `${total} beaches` : `${shown} / ${total} beaches`,
    water: 'Water',
    air: 'Air',
    wind: 'Wind',
    min: 'Min.',
    max: 'Max.',
    average: 'Average',
    airStation: 'Air forecast station',
    ascending: 'ascending',
    descending: 'descending',
    sortBy: 'Sort by',
    sortLabels: {
      name: 'Beach', district: 'District', municipality: 'Municipality',
      waterMin: 'Minimum water', waterMax: 'Maximum water',
      airMin: 'Minimum air', airMax: 'Maximum air', windAvg: 'Average wind',
    },
    expand: 'Show details for',
    collapse: 'Hide details for',
    map: 'View on map',
    history: 'View history',
    missing: 'No data for this date',
    noResults: 'No beaches match your filters',
    noResultsHint: 'Try another name or clear the filters.',
    noBeaches: 'No beaches available',
    noBeachesHint: 'Please try again later.',
  },
}

export default function BeachTableView({
  beaches,
  activeDate,
  language,
  windUnit,
  onSelect,
  onExploreHistory,
  forecastControl,
  territoryControl,
}: BeachTableViewProps) {
  const uid = useId()
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState({ district: '', municipality: '' })
  const [sort, setSort] = useState<TableSortState>(defaultSortState())
  const [expandedId, setExpandedId] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const copy = getCopy(language)
  const text = TABLE_COPY[language]
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB'
  const windSuffix = windUnit === 'kmh' ? 'km/h' : 'kn'
  const { district, municipality } = reconcileLocationFilters(beaches, location)

  useEffect(() => {
    if (location.district !== district || location.municipality !== municipality) {
      setLocation({ district, municipality })
    }
  }, [location, district, municipality])

  const districts = useMemo(
    () => [...new Set(beaches.map((beach) => beach.district))].sort((a, b) => a.localeCompare(b, locale)),
    [beaches, locale],
  )
  const municipalities = useMemo(
    () => [...new Set(beaches.filter((beach) => !district || beach.district === district).map((beach) => beach.municipality))]
      .sort((a, b) => a.localeCompare(b, locale)),
    [beaches, district, locale],
  )
  const sorted = useMemo(() => {
    const filtered = filterBeaches(beaches, {
      query, district, municipality, language,
    })
    return sortBeaches(filtered, sort, activeDate, language)
  }, [beaches, query, district, municipality, language, activeDate, sort])

  const singleResultId = sorted.length === 1 ? sorted[0].id : ''
  useEffect(() => {
    if (singleResultId) setExpandedId(singleResultId)
  }, [singleResultId, query])

  const hasFilters = Boolean(query || district || municipality)
  const formattedDate = activeDate
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${activeDate}T12:00:00Z`))
    : text.noDate
  const reading = (value: number | undefined, unit: string, decimals = 1) => hasTableValue(value)
    ? <span className="beach-table-reading">{value.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}<span className="beach-table-unit"> {unit}</span></span>
    : <span className="beach-table-missing-value" aria-label={text.missing} title={text.missing}>—</span>
  const temperature = (value: number | undefined, decimals = 1) => reading(value, '°C', decimals)
  const wind = (value: number | undefined) => reading(hasTableValue(value) ? convertWind(value, windUnit) : undefined, windSuffix)

  function clearAll() {
    setQuery('')
    setLocation({ district: '', municipality: '' })
    searchRef.current?.focus()
  }

  function sortHeading(key: SortKey, label: string, detail?: string) {
    const next = toggleSort(sort, key)
    const Icon = key.startsWith('water') ? Droplets : key.startsWith('air') ? ThermometerSun : key === 'windAvg' ? Wind : null
    return (
      <button
        type="button"
        className="beach-table-sort-heading"
        onClick={() => setSort(next)}
        aria-label={`${text.sortBy} ${text.sortLabels[key]} (${next.dir === 'asc' ? text.ascending : text.descending})`}
      >
        <span><span className="beach-table-heading-label">{Icon && <Icon size={14} aria-hidden="true" />}{label}</span>{detail && <small>{detail}</small>}</span>
        <span className={sort.key === key ? 'beach-table-sort-arrow is-active' : 'beach-table-sort-arrow'} aria-hidden="true">
          {sort.key === key ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    )
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    return sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
  }

  return (
    <main className="btv-root beach-table" id="app-content" tabIndex={-1} aria-label={copy.beachList}>
      <section className="beach-table-results" aria-label={copy.beachList}>
        <div className="beach-table-toolbar">
          <div className="beach-table-search">
            <Search size={18} aria-hidden="true" />
            <input
              id={`${uid}-search`}
              type="search"
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={text.searchPlaceholder}
              aria-label={text.searchPlaceholder}
            />
            {query && (
              <button type="button" aria-label={copy.clear} onClick={() => { setQuery(''); searchRef.current?.focus() }}>
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="beach-table-summary">
            <span className="beach-table-count" role="status" aria-live="polite" aria-atomic="true">{text.count(sorted.length, beaches.length)}</span>
            {hasFilters && <button type="button" className="beach-table-reset" onClick={clearAll} aria-label={copy.clearFilters} title={copy.clearFilters}><X size={17} aria-hidden="true" /></button>}
          </div>
          <div className="beach-table-filters">
            {territoryControl && <div className="beach-table-territory">{territoryControl}</div>}
            {forecastControl && <div className="beach-table-forecast">{forecastControl}</div>}
            <label className="beach-table-field">
              <span className="sr-only">{copy.district}</span>
              <select value={district} onChange={(event) => setLocation({ district: event.target.value, municipality: '' })}>
                <option value="">{text.allDistricts}</option>
                {districts.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="beach-table-field">
              <span className="sr-only">{copy.municipality}</span>
              <select value={municipality} onChange={(event) => setLocation({ district, municipality: event.target.value })}>
                <option value="">{text.allMunicipalities}</option>
                {municipalities.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="beach-table-empty">
            <Search size={28} aria-hidden="true" />
            <h3>{beaches.length ? text.noResults : text.noBeaches}</h3>
            <p>{beaches.length ? text.noResultsHint : text.noBeachesHint}</p>
            {hasFilters && <Button onClick={clearAll}>{copy.clearFilters}</Button>}
          </div>
        ) : (
          <div className="beach-table-scroll" tabIndex={0} role="region" aria-label={`${copy.beachList} · ${formattedDate}`}>
            <table className="beach-table-table">
              <caption className="sr-only">{copy.beachList} · {formattedDate}</caption>
              <thead>
                <tr>
                  <th scope="col" className="beach-table-name-col" aria-sort={ariaSort('name')}>{sortHeading('name', copy.beach)}</th>
                  <th scope="col" className="beach-table-location-col" aria-sort={ariaSort('district')}>{sortHeading('district', copy.district)}</th>
                  <th scope="col" className="beach-table-location-col" aria-sort={ariaSort('municipality')}>{sortHeading('municipality', copy.municipality)}</th>
                  <th scope="col" className="beach-table-num beach-table-min-col beach-table-water-col" aria-sort={ariaSort('waterMin')}>{sortHeading('waterMin', text.water, `${text.min} °C`)}</th>
                  <th scope="col" className="beach-table-num beach-table-water-col" aria-sort={ariaSort('waterMax')}>{sortHeading('waterMax', text.water, `${text.max} °C`)}</th>
                  <th scope="col" className="beach-table-num beach-table-min-col beach-table-air-col" aria-sort={ariaSort('airMin')}>{sortHeading('airMin', text.air, `${text.min} °C`)}</th>
                  <th scope="col" className="beach-table-num beach-table-air-col" aria-sort={ariaSort('airMax')}>{sortHeading('airMax', text.air, `${text.max} °C`)}</th>
                  <th scope="col" className="beach-table-num beach-table-wind-col" aria-sort={ariaSort('windAvg')}>{sortHeading('windAvg', text.wind, `${text.average} ${windSuffix}`)}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((beach) => {
                  const forecast = getTableForecast(beach, activeDate)
                  const expanded = expandedId === beach.id
                  const detailId = `${uid}-detail-${beach.id}`
                  const toggleId = `${uid}-toggle-${beach.id}`
                  return (
                    <Fragment key={beach.id}>
                      <tr className={`beach-table-row${expanded ? ' is-expanded' : ''}`}>
                        <th scope="row" className="beach-table-name-cell">
                          <button
                            id={toggleId}
                            type="button"
                            className="beach-table-name-button"
                            aria-label={`${expanded ? text.collapse : text.expand} ${beach.name}`}
                            aria-expanded={expanded}
                            aria-controls={expanded ? detailId : undefined}
                            onClick={() => setExpandedId(expanded ? '' : beach.id)}
                          >
                            <ChevronDown size={17} aria-hidden="true" />
                            <span><strong>{beach.name}</strong><small>{beach.municipality} · {beach.district}</small></span>
                          </button>
                        </th>
                        <td className="beach-table-location-col">{beach.district}</td>
                        <td className="beach-table-location-col">{beach.municipality}</td>
                        <td className="beach-table-num beach-table-min-col beach-table-water-col">{temperature(forecast?.waterMin)}</td>
                        <td className="beach-table-num beach-table-water-col"><strong>{temperature(forecast?.waterMax)}</strong></td>
                        <td className="beach-table-num beach-table-min-col beach-table-air-col">{temperature(forecast?.airMin, 0)}</td>
                        <td className="beach-table-num beach-table-air-col">{temperature(forecast?.airMax, 0)}</td>
                        <td className="beach-table-num beach-table-wind-col">{wind(forecast?.windAverageKnots)}</td>
                      </tr>
                      {expanded && (
                        <tr className="beach-table-detail-row">
                          <td colSpan={8}>
                            <section id={detailId} className="beach-table-detail" aria-labelledby={toggleId}>
                              <div className="beach-table-detail-head">
                                <time dateTime={activeDate || undefined}>{formattedDate}</time>
                                <div className="beach-table-actions">
                                  {onExploreHistory && <Button variant="outline" onClick={() => onExploreHistory(beach)}><History size={16} aria-hidden="true" />{text.history}</Button>}
                                  <Button variant="outline" onClick={() => onSelect(beach)}><Map size={16} aria-hidden="true" />{text.map}</Button>
                                </div>
                              </div>
                              {!forecast && <p className="beach-table-missing">{text.missing}</p>}
                              {forecast?.airLocation && (
                                <p className="beach-table-source">
                                  {text.airStation}: {forecast.airLocation}
                                  {hasTableValue(forecast.airDistanceKm) && ` · ${formatDistance(forecast.airDistanceKm)}`}
                                </p>
                              )}
                              {activeDate && (
                                <BeachDayHours
                                  key={`${beach.id}/${activeDate}`}
                                  beachId={beach.id}
                                  date={activeDate}
                                  language={language}
                                  windUnit={windUnit}
                                  layout="compact"
                                />
                              )}
                            </section>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
