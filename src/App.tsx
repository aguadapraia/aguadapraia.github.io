import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { List, Map as MapIcon, TrendingUp } from 'lucide-react'
import BeachDetails from './components/BeachDetails'
import BrandMark from './components/BrandMark'
import LoadingIndicator from './components/LoadingIndicator'
import MapDiscovery from './components/MapDiscovery'
import MapLegend from './components/MapLegend'
import SettingsPanel from './components/SettingsPanel'
import TerritorySelect from './components/TerritorySelect'
import { loadBeachDataset } from './data/api'
import { getCopy } from './i18n'
import { lisbonDate, preferredForecastDate } from './lib/date-classification'
import { formatFreshnessTimestamp } from './lib/freshness'
import { getRelativeLabel } from './lib/relative-date'
import { loadSettings, saveSettings } from './lib/settings'
import { canonicalUrlForView, pathForView, viewFromPath, type AppViewMode } from './lib/view-route'
import type { BeachDataset, BeachViewModel, TerritoryFilter } from './types'
import './app.css'

const PortugalMap = lazy(() => import('./components/PortugalMap'))
const EvolutionView = lazy(() => import('./components/EvolutionView'))
const BeachTableView = lazy(() => import('./components/BeachTableView'))

function GithubMark() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 22v-4a3.5 3.5 0 0 0-.78-2.2c3.26-.36 6.68-1.6 6.68-7.3A5.7 5.7 0 0 0 19.5 4.3 5.4 5.4 0 0 0 19.41.28S18.28-.08 15 2.2a13.4 13.4 0 0 0-6 0C5.72-.08 4.59.28 4.59.28A5.4 5.4 0 0 0 4.5 4.3 5.7 5.7 0 0 0 3 8.5c0 5.66 3.42 6.9 6.68 7.3A3.5 3.5 0 0 0 9 18v4" />
    <path d="M9 18c-4.5 2-5-2-7-2" />
  </svg>
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const { language, theme, windUnit, mapMetric, territory } = settings
  const copy = getCopy(language)
  const pt = language === 'pt'
  const [dataset, setDataset] = useState<BeachDataset | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [activeDate, setActiveDate] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nearbyIds, setNearbyIds] = useState<string[]>([])
  const focusNearby = useRef(false)
  const [historyBeachId, setHistoryBeachId] = useState<string | undefined>()
  const [historyOrigin, setHistoryOrigin] = useState<'map' | 'table' | null>(null)
  const historyTrigger = useRef<HTMLElement | null>(null)
  const historyViewport = useRef({ width: 0, height: 0 })
  const historyScroll = useRef<{ element: HTMLElement; top: number; left: number }[]>([])
  const returningFromHistory = useRef(false)
  const [viewMode, setViewMode] = useState<AppViewMode>(() => viewFromPath(window.location.pathname))
  const [mobileLayout, setMobileLayout] = useState(() => window.matchMedia('(max-width: 760px)').matches)

  useEffect(() => {
    let active = true
    setLoadError(false)
    loadBeachDataset().then((loaded) => {
      if (!active) return
      setDataset(loaded)
      setActiveDate(preferredForecastDate(loaded.forecastDates))
    }).catch((error: unknown) => {
      if (!active) return
      console.warn('Beach forecast loading failed:', error)
      setLoadError(true)
    })
    return () => { active = false }
  }, [loadAttempt])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', getComputedStyle(document.documentElement).getPropertyValue('--cp-bg').trim(),
    )
  }, [theme])
  useEffect(() => { document.documentElement.lang = language }, [language])
  useEffect(() => { saveSettings(settings) }, [settings])
  useEffect(() => {
    const root = document.documentElement
    const pointer = () => { root.dataset.inputMode = 'pointer' }
    const keyboard = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey &&
        ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) {
        root.dataset.inputMode = 'keyboard'
      }
    }
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('keydown', keyboard, true)
    return () => {
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('keydown', keyboard, true)
    }
  }, [])
  useEffect(() => {
    if (focusNearby.current && selectedId) {
      focusNearby.current = false
      document.querySelector<HTMLElement>(nearbyIds.length > 1 ? '.beach-nearby select' : '#beach-detail-title')?.focus()
    }
  }, [nearbyIds, selectedId])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setMobileLayout(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const handlePopState = () => {
      const nextView = viewFromPath(window.location.pathname)
      const origin = window.history.state?.returnView
      if (nextView === 'evolution') captureHistoryOrigin()
      returningFromHistory.current = viewMode === 'evolution' && nextView === historyOrigin
      setHistoryOrigin(nextView === 'evolution' && (origin === 'map' || origin === 'table') ? origin : null)
      if (nextView === 'evolution') {
        const id = window.history.state?.beachId
        setHistoryBeachId(typeof id === 'string' ? id : undefined)
      } else if (!returningFromHistory.current) {
        historyTrigger.current = null
        historyScroll.current = []
      }
      setViewMode(nextView)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [historyOrigin, viewMode])
  useEffect(() => {
    if (viewMode === 'evolution' || !returningFromHistory.current) return
    returningFromHistory.current = false
    const frame = requestAnimationFrame(() => {
      for (const { element, top, left } of historyScroll.current) element.scrollTo({ top, left })
      historyTrigger.current?.focus({ preventScroll: true })
      historyTrigger.current = null
      historyScroll.current = []
    })
    return () => cancelAnimationFrame(frame)
  }, [viewMode])
  useEffect(() => {
    const label = viewMode === 'map' ? copy.mapView : viewMode === 'table' ? copy.tableView : copy.evolutionView
    const title = `${label} - ÁguaDaPraia`
    document.title = title
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonicalUrlForView(viewMode))
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonicalUrlForView(viewMode))
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title)
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title)
  }, [copy.evolutionView, copy.mapView, copy.tableView, viewMode])

  const territoryBeaches = useMemo(() => {
    if (!dataset) return []
    return territory === 'all' ? dataset.beaches : dataset.beaches.filter((beach) => beach.territory === territory)
  }, [dataset, territory])
  const visibleDates = useMemo(() => {
    if (!dataset) return []
    const today = lisbonDate()
    const dates = dataset.forecastDates.filter((date) => date >= today &&
      dataset.beaches.some((beach) => {
        const forecast = beach.daily.find((item) => item.date === date)
        return forecast && [forecast.waterMax, forecast.airMax, forecast.windAverageKnots].some(Number.isFinite)
      })).slice(0, 3)
    return dates.length ? dates : dataset.forecastDates
  }, [dataset])

  function updateTerritory(value: TerritoryFilter) {
    setSettings((current) => ({ ...current, territory: value }))
    setSelectedId(null)
    setNearbyIds([])
  }
  function navigateToView(view: AppViewMode) {
    if (view === viewMode) return
    if (viewMode === 'evolution' && view === historyOrigin) { returnFromHistory(); return }
    historyTrigger.current = null
    historyScroll.current = []
    setHistoryOrigin(null)
    setViewMode(view)
    if (view !== 'map') { setSelectedId(null); setNearbyIds([]) }
    const path = pathForView(view)
    if (window.location.pathname !== path) window.history.pushState(null, '', path)
  }
  function selectBeach(beach: BeachViewModel, nearby: string[] = []) {
    setSettings((current) => ({ ...current, territory: beach.territory }))
    setSelectedId(beach.id)
    setNearbyIds(nearby)
  }
  function exploreHistory(beach?: BeachViewModel) {
    if (viewMode === 'evolution') return
    captureHistoryOrigin()
    setHistoryOrigin(viewMode)
    setHistoryBeachId(beach?.id)
    setViewMode('evolution')
    window.history.pushState({ returnView: viewMode, beachId: beach?.id }, '', pathForView('evolution'))
  }
  function captureHistoryOrigin() {
    const main = document.getElementById('app-content')
    if (!main) return
    const { width, height } = main.getBoundingClientRect()
    // Keep the previous map and charts at their measured size while history is open.
    historyViewport.current = { width, height }
    historyTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    historyScroll.current = [main, ...main.querySelectorAll<HTMLElement>('.beach-sidebar-body, .beach-table-scroll, .beach-hourly-scroll')]
      .map((element) => ({ element, top: element.scrollTop, left: element.scrollLeft }))
  }
  function returnFromHistory() {
    if (historyOrigin && window.history.state?.returnView === historyOrigin) {
      window.history.back()
    } else {
      setHistoryOrigin(null)
      setViewMode('map')
      window.history.replaceState(null, '', pathForView('map'))
    }
  }
  function closeBeachDetails() {
    setSelectedId(null)
    setNearbyIds([])
    document.querySelector<HTMLInputElement>('.beach-search-field input')?.focus()
  }

  if (loadError) return (
    <main className="app-state">
      <BrandMark size={40} /><h1>{copy.dataUnavailable}</h1>
      <p>{pt ? 'A ligação aos dados pode demorar um pouco. Tenta novamente.' : 'The data connection may take a moment. Please try again.'}</p>
      <button type="button" className="beach-retry" onClick={() => setLoadAttempt((value) => value + 1)}>{copy.retry}</button>
    </main>
  )
  if (!dataset || !activeDate) return (
    <main className="app-state">
      <LoadingIndicator label={copy.loading} />
    </main>
  )

  const selectedBeach = dataset.beaches.find((beach) => beach.id === selectedId)
  const nearbyBeaches = nearbyIds.flatMap((id) => {
    const beach = dataset.beaches.find((item) => item.id === id)
    return beach ? [beach] : []
  })
  const updatedAt = dataset.forecastUpdatedAt || dataset.generatedAt
  const navigation = [
    { view: 'map', label: copy.mapView, icon: MapIcon },
    { view: 'table', label: copy.tableView, icon: List },
    { view: 'evolution', label: copy.evolutionView, icon: TrendingUp },
  ] as const

  return (
    <div className={`map-app beach-app beach-view-${viewMode}`}>
      <a href="#app-content" className="beach-skip-link">{pt ? 'Saltar para o conteúdo' : 'Skip to content'}</a>
      <header className="site-header">
        <a className="brand" href={pathForView('map')} aria-label="ÁguaDaPraia"
          onClick={(event) => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
            event.preventDefault(); setSelectedId(null); navigateToView('map')
          }}>
          <span className="brand-mark"><BrandMark size={44} animate /></span><span>ÁguaDaPraia</span>
        </a>
        <nav className="beach-navigation" aria-label={copy.viewNavigation}>
          {navigation.map(({ view, label, icon: Icon }) => <a key={view}
            href={pathForView(view)} aria-current={viewMode === view ? 'page' : undefined}
            onClick={(event) => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              if (view === 'evolution') exploreHistory()
              else navigateToView(view)
            }}><Icon size={17} />{label}</a>)}
        </nav>
        <div className="header-right">
          <SettingsPanel settings={settings} onSettingsChange={setSettings} isMobile={mobileLayout} />
        </div>
      </header>

      {viewMode !== 'evolution' && activeDate < lisbonDate() && <p className="beach-stale-notice" role="status">
        {pt ? 'Ainda não há previsão atualizada para hoje. Estás a ver a última data publicada.' : 'Today’s forecast is not available yet. Showing the last published date.'}
      </p>}

      {(viewMode === 'map' || historyOrigin === 'map') && (
        <main id={viewMode === 'map' ? 'app-content' : undefined} data-suspended={viewMode !== 'map'} inert={viewMode !== 'map'}
          aria-hidden={viewMode !== 'map'} style={viewMode !== 'map' ? historyViewport.current : undefined}
          tabIndex={-1} className="map-stage beach-map-layout">
            <MapDiscovery beaches={dataset.beaches} activeDate={activeDate} territory={territory} selectedBeach={selectedBeach}
              language={language} windUnit={windUnit} metric={mapMetric}
              onMetricChange={(metric) => setSettings((current) => ({ ...current, mapMetric: metric }))}
              onSelect={selectBeach} onClearSelection={closeBeachDetails}
              controls={<>
                <TerritorySelect value={territory} language={language} onChange={updateTerritory} />
                <div className="date-switch" role="group" aria-label={copy.forecastDays}>
                  {visibleDates.map((date) => {
                    const label = getRelativeLabel(date, dataset.forecastDates, language)
                    return <button key={date} type="button" className={date === activeDate ? 'active' : ''}
                      aria-pressed={date === activeDate} title={label.compactDate} onClick={() => setActiveDate(date)}>
                      {label.relative}
                    </button>
                  })}
                </div>
              </>}>
              {selectedBeach && <BeachDetails key={selectedBeach.id} beach={selectedBeach} date={activeDate}
                dates={visibleDates} language={language} windUnit={windUnit} metric={mapMetric}
                nearbyBeaches={nearbyBeaches} onSelectNearby={(beach) => selectBeach(beach, nearbyIds)}
                onMetricChange={(metric) => setSettings((current) => ({ ...current, mapMetric: metric }))}
                onExploreHistory={() => exploreHistory(selectedBeach)} />}
            </MapDiscovery>
          <div className="beach-map-canvas">
            <Suspense fallback={<LoadingIndicator label={copy.loading} />}>
              <PortugalMap beaches={territoryBeaches}
                districtWeather={dataset.districtWeather}
                activeDate={activeDate} language={language} selectedId={selectedBeach?.id ?? ''}
                territory={territory} theme={theme} windUnit={windUnit} mapMetric={mapMetric}
                isMobile={mobileLayout} clusterRadius={18} clusterZoomRate={1.65}
                clusterChoicesInline
                onSelect={(id) => {
                  const beach = dataset.beaches.find((item) => item.id === id)
                  if (beach) selectBeach(beach)
                }}
                onClusterSelect={(id, nearby, keyboard) => {
                  const beach = dataset.beaches.find((item) => item.id === id)
                  if (beach) {
                    focusNearby.current = keyboard
                    setSelectedId(beach.id)
                    setNearbyIds(nearby)
                  }
                }}
                onClearSelection={closeBeachDetails} />
            </Suspense>
            <MapLegend language={language} metric={mapMetric} windUnit={windUnit} />
          </div>
        </main>
      )}
      {(viewMode === 'table' || historyOrigin === 'table') && (
        <Suspense fallback={<main className="beach-view-loading"><LoadingIndicator label={copy.loading} /></main>}>
        <BeachTableView beaches={territoryBeaches} activeDate={activeDate} language={language}
          suspendedSize={viewMode !== 'table' ? historyViewport.current : undefined}
          windUnit={windUnit} onSelect={(beach) => { navigateToView('map'); selectBeach(beach) }}
          onExploreHistory={exploreHistory}
          territoryControl={<TerritorySelect value={territory} language={language} onChange={updateTerritory} />}
          forecastControl={<select className="forecast-select" aria-label={copy.forecastDays}
           value={activeDate} onChange={(event) => setActiveDate(event.target.value)}>
           {visibleDates.map((date) => {
             const label = getRelativeLabel(date, dataset.forecastDates, language)
             return <option key={date} value={date}>{label.relative} · {label.compactDate}</option>
           })}
          </select>} />
        </Suspense>
      )}
      {viewMode === 'evolution' && (
        <Suspense fallback={<main className="beach-view-loading"><LoadingIndicator label={copy.loadingHistory} /></main>}>
          <EvolutionView key={historyBeachId ?? 'territory'} dataset={dataset} language={language}
            windUnit={windUnit} theme={theme} initialTerritory={territory}
            initialMapMetric={mapMetric} initialBeachId={historyBeachId}
            onReturn={returnFromHistory} returnLabel={historyOrigin === 'table' ? copy.backToTable : copy.backToMap} />
        </Suspense>
      )}

      <footer className="attribution-bar">
        <a className="attribution-source" href="https://www.ipma.pt/" target="_blank" rel="noreferrer noopener">
          {copy.attribution} IPMA.pt<span>· <span className="attribution-freshness">{copy.freshness} </span><time dateTime={updatedAt} title={copy.freshness}>{formatFreshnessTimestamp(updatedAt, language)}</time></span>
        </a>
        <span className="attribution-credit">
          <a href="https://github.com/f-caetano/aguadapraia" target="_blank" rel="noreferrer noopener"
            className="attribution-github" aria-label={`Filipe Caetano · GitHub (${copy.opensNewWindow})`}>
            <GithubMark /><span>Filipe Caetano</span>
          </a>
          <span className="attribution-copyright">© 2026</span>
        </span>
      </footer>
    </div>
  )
}
