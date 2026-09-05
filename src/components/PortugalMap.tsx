import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw, X } from 'lucide-react'
import { geoCentroid, geoPath, type GeoProjection } from 'd3-geo'
import { select } from 'd3-selection'
import 'd3-transition'
import {
  zoom as createZoom,
  zoomIdentity,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3-zoom'
import type {
  FeatureCollection,
  Geometry,
} from 'geojson'
import { getCopy, type Language } from '../i18n'
import type {
  BeachViewModel,
  DailyBeachForecast,
  DistrictWeatherForecast,
  MapMetric,
  TerritoryFilter,
  Theme,
} from '../types'
import { publicAssetUrl } from '../lib/public-asset'
import { forecastForDate } from '../lib/beach-discovery'
import { placeWeatherBadges, weatherKind, weatherLabel } from '../lib/weather-symbol'
import WeatherSymbol from './WeatherSymbol'
import LoadingIndicator from './LoadingIndicator'
import {
  formatMapMetricValue,
  isPreferredMetricValue,
  mapMetricValue,
  windColourClass,
} from '../lib/map-metric'
import {
  adaptiveClusterRadius,
  clusterZoomLevel,
  initialMapTransform,
  mapHeight,
  mapWidth,
  reframeMapTransform,
} from '../lib/map-transform'
import {
  clusterClickScale,
  clusterChoiceIds,
  filterDistricts,
  fitMapProjection,
  groupMapPoints,
  mapFitExtent,
  mapMarkerGeometry,
  mapMarkerRadius,
  mapMarkerScale,
  mapMarkerValueSize,
  prepareDistricts,
  type MapSize,
} from '../lib/map-layout'
import { convertWind, formatWind, type WindUnit } from '../lib/units'
import { Button } from './ui/button'
import './portugal-map.css'

interface PortugalMapProps {
  beaches: BeachViewModel[]
  districtWeather: DistrictWeatherForecast[]
  activeDate: string
  language: Language
  selectedId: string
  territory: TerritoryFilter
  theme: Theme
  windUnit: WindUnit
  mapMetric?: MapMetric
  isMobile?: boolean
  clusterRadius?: number
  clusterBaseZoom?: number
  clusterZoomRate?: number
  onSelect: (id: string) => void
  onClusterSelect?: (id: string, nearbyIds: string[], keyboard: boolean) => void
  clusterChoicesInline?: boolean
  onClearSelection: () => void
}

const maxZoom = 16
interface ClusterAction {
  id: string
  previousSelection: string
  territory: TerritoryFilter
  keyboard: boolean
}

const motionDuration = (duration: number) =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration

const districtFeatureIndexByLocation = new Map<number, number>([
  [1010500, 2],
  [1020500, 3],
  [1030300, 4],
  [1040200, 5],
  [1050200, 6],
  [1060300, 7],
  [1070500, 8],
  [1080500, 9],
  [1090700, 10],
  [1100900, 11],
  [1110600, 12],
  [1121400, 13],
  [1131200, 14],
  [1141600, 15],
  [1151200, 16],
  [1160900, 17],
  [1171400, 18],
  [1182300, 19],
])

const districtDisplayLocationIds = new Set([
  ...districtFeatureIndexByLocation.keys(),
  2310300,
  2320100,
  3410100,
  3420300,
  3430100,
  3440100,
  3450200,
  3460200,
  3470100,
  3480200,
  3490100,
])

function temperatureClass(temperature: number) {
  if (temperature < 18) return 'cold'
  if (temperature < 19.5) return 'cool'
  if (temperature < 21) return 'warm'
  if (temperature < 22.5) return 'hot'
  return 'very-hot'
}

function airTemperatureClass(temperature: number) {
  if (temperature < 20) return 'cold'
  if (temperature < 24) return 'cool'
  if (temperature < 28) return 'warm'
  if (temperature < 32) return 'hot'
  return 'very-hot'
}

function displayMetricClass(value: number, metric: MapMetric) {
  if (!Number.isFinite(value)) return 'missing'
  if (metric === 'wind') return windColourClass(value)
  return metric === 'air'
    ? airTemperatureClass(value)
    : temperatureClass(value)
}

function coordinateTerritory(longitude: number, latitude: number) {
  if (longitude < -20) return 'azores'
  if (latitude < 34) return 'madeira'
  return 'mainland'
}

let districtGeometry: Promise<FeatureCollection<Geometry>> | undefined

function loadDistrictGeometry() {
  if (!districtGeometry) {
    districtGeometry = fetch(publicAssetUrl('geo/districts.geojson'), { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error('District map geometry is unavailable')
        return response.json() as Promise<FeatureCollection<Geometry>>
      }).then(prepareDistricts).catch((error: unknown) => {
        districtGeometry = undefined
        throw error
      })
  }
  return districtGeometry
}

export default function PortugalMap({
  beaches,
  districtWeather,
  activeDate,
  language,
  selectedId,
  territory,
  theme,
  windUnit,
  mapMetric = 'water',
  isMobile = false,
  clusterRadius = 32,
  clusterBaseZoom = 6,
  clusterZoomRate = 1,
  onSelect,
  onClusterSelect,
  clusterChoicesInline = false,
  onClearSelection,
}: PortugalMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(
    null,
  )
  const transformRef = useRef<ZoomTransform>(zoomIdentity)
  const previousLayoutRef = useRef<{ projection: GeoProjection; size: MapSize; territory: TerritoryFilter } | null>(null)
  const focusedSelectionRef = useRef('')
  const clusterChoicesRef = useRef('')
  const pendingClusterRef = useRef<ClusterAction | null>(null)
  const markerElementsRef = useRef(new Map<string, SVGGElement>())
  const clusterTriggerRef = useRef<SVGGElement | null>(null)
  const clusterCloseRef = useRef<HTMLButtonElement>(null)
  const focusClusterRef = useRef(false)
  const clusterTitleId = useId()
  const [districts, setDistricts] =
    useState<FeatureCollection<Geometry> | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity)
  const [viewport, setViewport] = useState({ width: mapWidth, height: mapHeight, measured: false })
  const [readyCluster, setReadyCluster] = useState<ClusterAction | null>(null)
  const [popupAnchorId, setPopupAnchorId] = useState('')
  const beachesById = useMemo(() => new Map(beaches.map((beach) => [beach.id, beach])), [beaches])
  const copy = getCopy(language)
  const metricLabel = mapMetric === 'air'
    ? copy.air
    : mapMetric === 'wind'
      ? copy.wind
      : copy.water

  function getDisplayValue(forecast: DailyBeachForecast | undefined) {
    return mapMetricValue(forecast, mapMetric)
  }

  function formatDisplayValue(forecast: DailyBeachForecast | undefined) {
    return formatMapMetricValue(getDisplayValue(forecast), mapMetric, windUnit)
  }

  function markerValue(value: number) {
    if (!Number.isFinite(value)) return '—'
    const displayed = mapMetric === 'wind' ? convertWind(value, windUnit) : value
    return `${Math.round(displayed)}${mapMetric === 'wind' ? '' : '°'}`
  }

  function secondaryValues(forecast: DailyBeachForecast | undefined) {
    if (!forecast) return ''
    const water = Number.isFinite(forecast.waterMax)
      ? `${copy.water} ${forecast.waterMax.toFixed(1)} °C`
      : null
    const air = Number.isFinite(forecast.airMax)
      ? `${copy.air} ${forecast.airMax.toFixed(0)} °C`
      : null
    if (mapMetric === 'wind') {
      return [water, air].filter(Boolean).join(', ')
    }
    return mapMetric === 'air'
      ? (water ?? '')
      : (air ?? '')
  }

  function accessibleMetricValues(forecast: DailyBeachForecast | undefined) {
    const secondary = secondaryValues(forecast)
    return `${metricLabel} ${formatDisplayValue(forecast)}${secondary ? `, ${secondary}` : ''}`
  }

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const updateSize = () => {
      const bounds = svg.getBoundingClientRect()
      if (bounds.width < 1 || bounds.height < 1) return
      const width = Math.round(bounds.width)
      const height = Math.round(bounds.height)
      setViewport((current) => current.measured && current.width === width && current.height === height
        ? current
        : { width, height, measured: true })
    }
    const observer = new ResizeObserver(updateSize)
    updateSize()
    observer.observe(svg)
    return () => observer.disconnect()
  }, [districts, mapError])

  useEffect(() => {
    let active = true
    setMapError(null)
    loadDistrictGeometry()
      .then((collection) => { if (active) setDistricts(collection) })
      .catch((error) => {
        if (active) setMapError(error instanceof Error ? error.message : String(error))
      })
    return () => { active = false }
  }, [loadAttempt])

  const visibleDistricts = useMemo(() => {
    if (!districts) return null
    return {
      ...districts,
      features: filterDistricts(districts.features, territory),
    }
  }, [districts, territory])

  const projection = useMemo(() => {
    if (!visibleDistricts) return null
    return fitMapProjection(visibleDistricts, viewport)
  }, [visibleDistricts, viewport])
  const path = useMemo(
    () => (projection ? geoPath(projection) : null),
    [projection],
  )
  const activeWeather = useMemo(
    () =>
      districtWeather.filter(
        (weather) =>
          weather.date === activeDate &&
          districtDisplayLocationIds.has(weather.locationId) &&
          (territory === 'all' ||
            coordinateTerritory(weather.longitude, weather.latitude) ===
              territory),
      ),
    [activeDate, districtWeather, territory],
  )
  const clusterZoom = clusterZoomLevel(
    transform.k,
    1,
    clusterBaseZoom,
    clusterZoomRate,
  )
  const effectiveClusterRadius = adaptiveClusterRadius(
    clusterRadius,
    2 ** (clusterZoom - clusterBaseZoom),
    1,
  )
  const projectedBeaches = useMemo(() => {
    if (!projection) return []
    return beaches.flatMap((beach) => {
      if (territory !== 'all' && beach.territory !== territory) return []
      const point = projection([beach.longitude, beach.latitude])
      if (!point) return []
      return [{
        id: beach.id,
        territory: beach.territory,
        beach,
        point,
        x: point[0] * transform.k,
        y: point[1] * transform.k,
      }]
    })
  }, [beaches, projection, territory, transform.k])
  const markerGroups = useMemo(() =>
    groupMapPoints(projectedBeaches, effectiveClusterRadius, selectedId, transform.k)
      .sort((a, b) => Number(a.anchor.id === selectedId) - Number(b.anchor.id === selectedId)),
  [projectedBeaches, effectiveClusterRadius, selectedId, transform.k])
  const visibleMarkerGroups = markerGroups.filter(({ anchor }) => {
    const x = anchor.x + transform.x
    const y = anchor.y + transform.y
    return x >= -30 && y >= -30 && x <= viewport.width + 30 && y <= viewport.height + 30
  })
  const weatherMarkers = useMemo(() => {
    if (!projection) return []
    const candidates = [...activeWeather].sort((a, b) => a.locationId - b.locationId).flatMap((weather) => {
      const index = districtFeatureIndexByLocation.get(weather.locationId)
      const feature = index === undefined ? undefined : districts?.features[index]
      const point = projection(feature ? geoCentroid(feature) : [weather.longitude, weather.latitude])
      if (!point) return []
      const [x, y] = transform.apply(point)
      return [{ weather, x, y }]
    })
    const obstacles = markerGroups.map(({ anchor, points }) => {
      const diameter = mapMarkerRadius(anchor.id === selectedId, transform.k, points.length > 1) * 2
      return { x: anchor.x + transform.x, y: anchor.y + transform.y, width: diameter, height: diameter }
    })
    obstacles.push(
      { x: viewport.width / 2, y: viewport.height - 24, width: viewport.width, height: 48 },
      { x: viewport.width - 34, y: viewport.height - 86, width: 60, height: 160 },
    )
    return placeWeatherBadges(candidates, viewport, obstacles, isMobile ? 12 : 8)
  }, [activeWeather, districts, isMobile, markerGroups, projection, selectedId, transform, viewport])
  const hoveredBeach = hoveredId ? beachesById.get(hoveredId) : undefined
  const markerScreenScale = mapMarkerScale(transform.k)
  const markerScale = markerScreenScale / transform.k
  const markerFontSize = mapMarkerValueSize(transform.k) / markerScreenScale
  const weatherMarkerScale = 1 / transform.k
  const openClusterIds = clusterChoicesInline ? [] : clusterChoiceIds(markerGroups, popupAnchorId)
  const clusterBeaches = openClusterIds.flatMap((id) => {
    const beach = beachesById.get(id)
    return beach && (territory === 'all' || beach.territory === territory) ? [beach] : []
  }).sort((a, b) => a.name.localeCompare(b.name, language))
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg || !projection || !viewport.measured) return
    const previous = previousLayoutRef.current
    const nextTransform = previous && previous.territory === territory
      ? reframeMapTransform(transformRef.current, previous.projection, projection, previous.size, viewport)
      : initialMapTransform()
    const behavior = createZoom<SVGSVGElement, unknown>()
      .scaleExtent([1, maxZoom])
      .extent([[0, 0], [viewport.width, viewport.height]])
      .translateExtent([
        [-viewport.width * 0.35, -viewport.height * 0.35],
        [viewport.width * 1.35, viewport.height * 1.35],
      ])
      .wheelDelta((event) => {
        const mode = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002
        return -event.deltaY * mode
      })
      .on('zoom', (event) => {
        transformRef.current = event.transform
        setTransform(event.transform)
        if (event.sourceEvent) {
          pendingClusterRef.current = null
          setReadyCluster(null)
        }
      })
    zoomBehaviorRef.current = behavior
    previousLayoutRef.current = { projection, size: viewport, territory }
    select(svg).interrupt().call(behavior).call(behavior.transform, nextTransform)
    if (previous?.territory !== territory) {
      setPopupAnchorId('')
      focusClusterRef.current = false
      setHoveredId(null)
    }
    return () => {
      select(svg).interrupt().on('.zoom', null)
      zoomBehaviorRef.current = null
    }
  }, [projection, territory, viewport])

  useLayoutEffect(() => {
    const pending = pendingClusterRef.current
    if (pending && (pending.previousSelection !== selectedId || pending.territory !== territory)) {
      pendingClusterRef.current = null
      setReadyCluster(null)
      if (svgRef.current) select(svgRef.current).interrupt()
    }
  }, [selectedId, territory])

  // Publish from the committed layout, never from a transition's captured props.
  // A nearby choice or external selection then becomes the new grouping anchor.
  useLayoutEffect(() => {
    if (readyCluster && pendingClusterRef.current === readyCluster) {
      pendingClusterRef.current = null
      setReadyCluster(null)
      if (!projectedBeaches.some((point) => point.id === readyCluster.id)) return
      const groups = groupMapPoints(projectedBeaches, effectiveClusterRadius, readyCluster.id, transform.k)
      const ids = clusterChoiceIds(groups, readyCluster.id)
      focusedSelectionRef.current = readyCluster.id
      clusterChoicesRef.current = `${readyCluster.id}:${ids.join(',')}`
      if (onClusterSelect) onClusterSelect(readyCluster.id, ids, readyCluster.keyboard)
      else if (readyCluster.id !== selectedId) onSelect(readyCluster.id)
      if (!clusterChoicesInline) {
        focusClusterRef.current = ids.length > 1
        setPopupAnchorId(readyCluster.id)
      }
      return
    }
    if (pendingClusterRef.current) return
    if (!clusterChoicesInline || !selectedId || !onClusterSelect) {
      clusterChoicesRef.current = ''
      return
    }
    if (!projectedBeaches.some((point) => point.id === selectedId)) return
    const ids = clusterChoiceIds(markerGroups, selectedId)
    const key = `${selectedId}:${ids.join(',')}`
    if (key !== clusterChoicesRef.current) {
      clusterChoicesRef.current = key
      onClusterSelect(selectedId, ids, false)
    }
  }, [clusterChoicesInline, effectiveClusterRadius, markerGroups, onClusterSelect, onSelect, projectedBeaches, readyCluster, selectedId, transform.k])

  useLayoutEffect(() => {
    if (!selectedId) {
      focusedSelectionRef.current = ''
      return
    }
    if (!projection || !viewport.measured || focusedSelectionRef.current === selectedId) return
    const selected = beachesById.get(selectedId)
    const svg = svgRef.current
    const behavior = zoomBehaviorRef.current
    if (!selected || !svg || !behavior || (territory !== 'all' && selected.territory !== territory)) return
    focusedSelectionRef.current = selectedId
    const point = projection([selected.longitude, selected.latitude])
    if (!point) return
    const targetScale = Math.max(transformRef.current.k, 4)
    const target = zoomIdentity
      .translate(
        viewport.width / 2 - point[0] * targetScale,
        viewport.height / 2 - point[1] * targetScale,
      )
      .scale(targetScale)
    select(svg).interrupt().transition().duration(motionDuration(360)).call(behavior.transform, target)
  }, [beachesById, projection, selectedId, territory, viewport])

  useLayoutEffect(() => {
    if (clusterBeaches.length && focusClusterRef.current) {
      focusClusterRef.current = false
      clusterCloseRef.current?.focus()
    }
  }, [clusterBeaches.length, popupAnchorId, readyCluster])

  function cancelClusterAction() {
    pendingClusterRef.current = null
    setReadyCluster(null)
  }

  function animateScale(factor: number) {
    const svg = svgRef.current
    const behavior = zoomBehaviorRef.current
    if (!svg || !behavior) return
    cancelClusterAction()
    select(svg).interrupt().transition().duration(motionDuration(240)).call(behavior.scaleBy, factor)
  }

  function resetZoom() {
    const svg = svgRef.current
    const behavior = zoomBehaviorRef.current
    if (!svg || !behavior) return
    cancelClusterAction()
    select(svg)
      .interrupt()
      .transition()
      .duration(motionDuration(300))
      .call(behavior.transform, initialMapTransform())
  }

  function closeCluster() {
    setPopupAnchorId('')
    focusClusterRef.current = false
    const anchor = markerGroups.find((group) => group.points.some((point) => point.id === popupAnchorId))?.anchor.id
    const marker = anchor && markerElementsRef.current.get(anchor)
    if (marker) marker.focus()
    else if (clusterTriggerRef.current?.isConnected) clusterTriggerRef.current.focus()
    else svgRef.current?.focus()
  }

  function activateMarker(points: typeof projectedBeaches, trigger: SVGGElement, keyboard = false) {
    if (points.length > 1) {
      activateCluster(points, trigger, keyboard)
    } else if (points.length) {
      cancelClusterAction()
      if (svgRef.current) select(svgRef.current).interrupt()
      setPopupAnchorId('')
      onSelect(points[0].id)
    }
  }

  function activateCluster(points: typeof projectedBeaches, trigger: SVGGElement, keyboard: boolean) {
    const svg = svgRef.current
    const behavior = zoomBehaviorRef.current
    if (!svg || !behavior || !points.length) return
    const scale = clusterClickScale(transformRef.current.k, maxZoom)
    const chosen = points.find((item) => item.id === selectedId) ?? points.reduce((best, item) =>
      isPreferredMetricValue(getDisplayValue(forecastForDate(item.beach, activeDate)),
        getDisplayValue(forecastForDate(best.beach, activeDate)), mapMetric) ? item : best)
    const target = zoomIdentity
      .translate(
        viewport.width / 2 - chosen.point[0] * scale,
        viewport.height / 2 - chosen.point[1] * scale,
      )
      .scale(scale)
    select(svg).interrupt()
    const action = { id: chosen.id, previousSelection: selectedId, territory, keyboard }
    pendingClusterRef.current = action
    setReadyCluster(null)
    clusterTriggerRef.current = trigger
    setPopupAnchorId('')
    setHoveredId(null)
    select(svg)
      .transition()
      .duration(motionDuration(280))
      .call(behavior.transform, target)
      .on('end.cluster', () => {
        if (pendingClusterRef.current === action) setReadyCluster(action)
      })
      .on('interrupt.cluster cancel.cluster', () => {
        if (pendingClusterRef.current === action) {
          pendingClusterRef.current = null
          setReadyCluster(null)
        }
      })
  }

  if (mapError) {
    return (
      <div className="map-error" role="alert">
        <strong>{copy.mapUnavailable}</strong>
        <span>{mapError}</span>
        <Button
          type="button"
          size="sm"
          onClick={() => setLoadAttempt((value) => value + 1)}
        >
          {copy.retry}
        </Button>
      </div>
    )
  }

  if (!visibleDistricts || !projection || !path) {
    return <div className="map-loading"><LoadingIndicator label={copy.loading} /></div>
  }

  return (
    <div className="svg-map-shell" data-theme={theme} data-metric={mapMetric} data-territory={territory}>
      <svg
        ref={svgRef}
        className="svg-map"
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        data-map-ready={viewport.measured}
        data-zoom-scale={transform.k}
        data-fit-extent={mapFitExtent(viewport).flat().join(' ')}
        role="group"
        tabIndex={-1}
        aria-label={`${copy.mapTitle} · ${metricLabel}`}
        onClick={(event) => {
          const target = event.target as Element
          if (
            target.closest(
              '.svg-beach-marker, .svg-beach-cluster, .district-weather-marker',
            )
          ) {
            return
          }
          cancelClusterAction()
          select(event.currentTarget).interrupt()
          setPopupAnchorId('')
          onClearSelection()
        }}
      >
        <rect width={viewport.width} height={viewport.height} className="map-ocean" />
        <g className="map-geometry" transform={transform.toString()}>
          <g className="map-land">
            {visibleDistricts.features.map((feature, index) => (
              <path
                key={`${feature.properties?.shapeName ?? 'district'}-${index}`}
                d={path(feature) ?? undefined}
                className="district-shape"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          {weatherMarkers.map(({ weather, x, y }) => {
            const kind = weatherKind(weather.weatherTypeId)
            const point = transform.invert([x, y])
            const label = `${weather.locationName}: ${weatherLabel(kind, language)}, ${language === 'pt' ? 'máxima' : 'maximum'} ${weather.maximumCelsius.toFixed(0)} °C, ${language === 'pt' ? 'mínima' : 'minimum'} ${weather.minimumCelsius.toFixed(0)} °C`
            return (
              <g
                key={`${weather.locationId}-${weather.date}`}
                className={`district-weather-marker weather-${kind}`}
                role="img"
                aria-label={label}
                transform={`translate(${point[0]} ${point[1]}) scale(${weatherMarkerScale})`}
                onClick={(event) => event.stopPropagation()}
              >
                <title>{label}</title>
                <rect className="district-weather-hit" x={-33} y={-19} width={66} height={38} rx={5} />
                <WeatherSymbol kind={kind} />
                <g transform="translate(5 -13)">
                  <rect className="weather-max-bg" width={27} height={15} rx={4} />
                  <text
                    className="weather-value weather-max-value"
                    x={13.5}
                    y={11}
                    textAnchor="middle"
                  >
                    {weather.maximumCelsius.toFixed(0)}°
                  </text>
                  <rect
                    className="weather-min-bg"
                    y={16}
                    width={23}
                    height={12}
                    rx={3.5}
                  />
                  <text
                    className="weather-value weather-min-value"
                    x={11.5}
                    y={25}
                    textAnchor="middle"
                  >
                    {weather.minimumCelsius.toFixed(0)}°
                  </text>
                </g>
              </g>
            )
          })}

          <g aria-hidden="true">
            {visibleMarkerGroups.map(({ anchor, points }) => (
              <circle key={anchor.id} className={points.length > 1 ? 'cluster-hit' : 'beach-hit'}
                cx={anchor.point[0]} cy={anchor.point[1]} r={22 / transform.k}
                onMouseEnter={() => setHoveredId(points.length > 1 ? null : anchor.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(event) => {
                  event.stopPropagation()
                  const marker = markerElementsRef.current.get(anchor.id)
                  if (marker) activateMarker(points, marker)
                }} />
            ))}
          </g>

          {visibleMarkerGroups.map(({ anchor, points }) => {
            const { beach, point } = anchor
            const forecast = forecastForDate(beach, activeDate)
            const selected = beach.id === selectedId
            const isCluster = points.length > 1
            const displayValue = isCluster && !selected
              ? points.reduce((best, item) => {
                const value = getDisplayValue(forecastForDate(item.beach, activeDate))
                return isPreferredMetricValue(value, best, mapMetric) ? value : best
              }, Number.NaN)
              : getDisplayValue(forecast)
            return (
              <g
                key={beach.id}
                ref={(element) => {
                  if (element) markerElementsRef.current.set(beach.id, element)
                  else markerElementsRef.current.delete(beach.id)
                }}
                data-beach-id={beach.id}
                className={`${isCluster ? 'svg-beach-cluster' : 'svg-beach-marker'}${selected && isCluster ? ' svg-beach-marker' : ''} ${displayMetricClass(
                  displayValue,
                  mapMetric,
                )}${selected ? ' selected' : ''}${
                  selectedId && !selected ? ' faded' : ''
                }`}
                transform={`translate(${point[0]} ${point[1]}) scale(${markerScale})`}
                role="button"
                tabIndex={0}
                aria-haspopup={isCluster && !clusterChoicesInline ? 'dialog' : undefined}
                aria-expanded={isCluster && !clusterChoicesInline ? openClusterIds.includes(beach.id) : undefined}
                aria-label={isCluster
                  ? `${selected ? `${beach.name}, ` : ''}${points.length} ${copy.locations}, ${metricLabel} ${formatMapMetricValue(displayValue, mapMetric, windUnit)}. ${language === 'pt' ? 'Aproximar e explorar praias' : 'Zoom in and explore beaches'}`
                  : `${beach.name}, ${beach.municipality}: ${accessibleMetricValues(forecast)}`}
                onMouseEnter={() => setHoveredId(isCluster ? null : beach.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(isCluster ? null : beach.id)}
                onBlur={() => setHoveredId(null)}
                onClick={(event) => {
                  event.stopPropagation()
                  activateMarker(points, event.currentTarget)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    activateMarker(points, event.currentTarget, true)
                  }
                }}
              >
                <circle className={isCluster ? 'cluster-dot' : 'beach-dot'}
                  r={selected ? mapMarkerGeometry.selectedRadius : mapMarkerGeometry.radius} />
                <text className={isCluster ? 'cluster-temperature' : 'beach-temperature'}
                  textAnchor="middle" y={6 / markerScreenScale} style={{ fontSize: markerFontSize }}>
                  {markerValue(displayValue)}
                </text>
                {isCluster && <>
                  <circle className="cluster-indicator" cx={mapMarkerGeometry.indicatorX}
                    cy={mapMarkerGeometry.indicatorY} r={mapMarkerGeometry.indicatorRadius} />
                  <text className="cluster-count" textAnchor="middle"
                    x={mapMarkerGeometry.indicatorX} y={mapMarkerGeometry.indicatorY + 2.8}>
                    {points.length}
                  </text>
                </>}
              </g>
            )
          })}

        </g>

        {hoveredBeach &&
          (() => {
            const point = projection([
              hoveredBeach.longitude,
              hoveredBeach.latitude,
            ])
            if (!point) return null
            const forecast = forecastForDate(hoveredBeach, activeDate)
            const displayValue = getDisplayValue(forecast)
            const transformedPoint = transform.apply(point)
            const tooltipX = Math.max(
              8,
              Math.min(viewport.width - 210, transformedPoint[0] + 12),
            )
            const tooltipY = Math.max(
              8,
              Math.min(viewport.height - 63, transformedPoint[1] - 64),
            )
            return (
              <g
                className="svg-map-tooltip"
                transform={`translate(${tooltipX} ${tooltipY})`}
              >
                <rect width={198} height={55} rx={9} />
                <text x={11} y={18} className="tooltip-title">
                  {hoveredBeach.name.slice(0, 28)}
                </text>
                <text x={11} y={36} className="tooltip-path">
                  {hoveredBeach.district} › {hoveredBeach.municipality}
                </text>
                <text x={11} y={49} className="tooltip-values">
                  {metricLabel} {formatMapMetricValue(displayValue, mapMetric, windUnit)}
                  {secondaryValues(forecast)
                    ? ` · ${secondaryValues(forecast).replaceAll(' °C', '°')}`
                    : ''}
                  {mapMetric !== 'wind' && forecast && Number.isFinite(forecast.windAverageKnots)
                    ? ` · ${formatWind(forecast.windAverageKnots, windUnit)}`
                    : ''}
                </text>
              </g>
            )
          })()}
      </svg>

      {clusterBeaches.length > 0 && (
        <section className="map-cluster-picker" role="dialog" aria-labelledby={clusterTitleId}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              closeCluster()
            }
          }}>
          <header>
            <strong id={clusterTitleId}>{clusterBeaches.length} {copy.locations}</strong>
            <button ref={clusterCloseRef} type="button" onClick={closeCluster}
              aria-label={language === 'pt' ? 'Fechar praias próximas' : 'Close nearby beaches'}>
              <X size={18} />
            </button>
          </header>
          <p className="map-cluster-hint">
            {transform.k < maxZoom
              ? language === 'pt' ? 'Aproxima o mapa para reduzir as opções.' : 'Zoom in to narrow the choices.'
              : language === 'pt' ? 'Escolhe uma praia deste grupo.' : 'Choose a beach from this group.'}
          </p>
          <ul>
            {clusterBeaches.map((beach) => {
              const forecast = forecastForDate(beach, activeDate)
              return (
                <li key={beach.id}>
                  <button type="button" aria-pressed={beach.id === selectedId}
                    aria-label={`${beach.name}, ${beach.municipality}: ${accessibleMetricValues(forecast)}`}
                    onClick={() => {
                      closeCluster()
                      onSelect(beach.id)
                    }}>
                    <span><strong>{beach.name}</strong><small>{beach.municipality}</small></span>
                    <b>{formatDisplayValue(forecast)}</b>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="svg-map-controls">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={copy.zoomIn}
          onClick={() => animateScale(1.45)}
        >
          <Plus size={17} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={copy.zoomOut}
          onClick={() => animateScale(1 / 1.45)}
        >
          <Minus size={17} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={copy.resetZoom}
          onClick={resetZoom}
        >
          <RotateCcw size={16} />
        </Button>
      </div>
    </div>
  )
}
