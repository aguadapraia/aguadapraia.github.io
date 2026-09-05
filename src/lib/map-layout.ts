import { geoMercator, type GeoPermissibleObjects } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { TerritoryFilter } from '../types'

export interface MapSize {
  width: number
  height: number
}

export function filterDistricts(features: Feature<Geometry>[], territory: TerritoryFilter) {
  if (territory === 'all') return features
  if (territory === 'madeira') return features.slice(0, 1)
  if (territory === 'azores') return features.slice(1, 2)
  return features.slice(2)
}

function rewindGeometry(geometry: Geometry): Geometry {
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: geometry.coordinates.map((ring) => [...ring].reverse()) }
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => [...ring].reverse())),
    }
  }
  return geometry
}

export function prepareDistricts(collection: FeatureCollection<Geometry>) {
  return {
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: rewindGeometry(feature.geometry),
    })),
  }
}

export function mapFitExtent({ width, height }: MapSize): [[number, number], [number, number]] {
  const horizontal = Math.min(24, width * 0.06)
  const top = Math.min(24, height * 0.04)
  const bottom = Math.min(48, height * 0.08)
  return [[horizontal, top], [width - horizontal, height - bottom]]
}

export function fitMapProjection(geometry: GeoPermissibleObjects, size: MapSize) {
  return geoMercator().fitExtent(mapFitExtent(size), geometry)
}

interface MapPoint {
  id: string
  territory: string
  x: number
  y: number
}

export interface MapPointGroup<T extends MapPoint> {
  anchor: T
  points: T[]
}

// Fixed anchors avoid joining a whole coastline through a chain of neighbours.
// Screen-space distances also make grouping independent of territory and aspect ratio.
export function groupMapPoints<T extends MapPoint>(
  points: readonly T[],
  radius: number,
  selectedId = '',
): MapPointGroup<T>[] {
  const distance = Math.max(1, radius)
  const groups: MapPointGroup<T>[] = []
  const cells = new Map<string, MapPointGroup<T>[]>()
  const sorted = [...points].sort((a, b) => {
    if (a.id === b.id) return 0
    if (a.id === selectedId) return -1
    if (b.id === selectedId) return 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  for (const point of sorted) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    const column = Math.floor(point.x / distance)
    const row = Math.floor(point.y / distance)
    let closest: MapPointGroup<T> | undefined
    let closestDistance = distance * distance
    for (let x = column - 1; x <= column + 1; x++) {
      for (let y = row - 1; y <= row + 1; y++) {
        for (const group of cells.get(`${point.territory}:${x}:${y}`) ?? []) {
          const squared = (group.anchor.x - point.x) ** 2 + (group.anchor.y - point.y) ** 2
          if (squared < closestDistance) {
            closest = group
            closestDistance = squared
          }
        }
      }
    }
    if (closest) {
      closest.points.push(point)
    } else {
      const group = { anchor: point, points: [point] }
      groups.push(group)
      const key = `${point.territory}:${column}:${row}`
      const cell = cells.get(key) ?? []
      cell.push(group)
      cells.set(key, cell)
    }
  }
  return groups
}

export function clusterClickScale(
  currentScale: number,
  maxScale: number,
) {
  return Math.min(maxScale, currentScale * 1.45 ** 2)
}

export function clusterChoiceIds<T extends MapPoint>(
  groups: readonly MapPointGroup<T>[], selectedId: string, atMaxZoom: boolean,
): string[] {
  const group = groups.find((item) => item.points.some((point) => point.id === selectedId))
  if (!group || group.points.length < 2 || (group.points.length > 4 && !atMaxZoom)) return []
  return group.points.map((point) => point.id)
}
