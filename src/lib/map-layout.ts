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

export const mapMarkerGeometry = {
  radius: 18,
  selectedRadius: 20,
  focusStroke: 3,
  selectedStroke: 3.5,
  indicatorX: 13,
  indicatorY: -17.5,
  indicatorRadius: 7.5,
  indicatorStroke: 0.8,
  gap: 1,
} as const

export function mapMarkerScale(zoomScale: number) {
  const step = Math.max(0, Math.log2(zoomScale))
  const diameter = 36 - Math.min(1, step) * 6 -
    Math.min(1, Math.max(0, step - 1)) * 4 -
    Math.min(1, Math.max(0, step - 2))
  return diameter / 36
}

export function mapMarkerValueSize(zoomScale: number) {
  const step = Math.max(0, Math.log2(zoomScale))
  return 13.5 - Math.min(1, step) -
    Math.min(1, Math.max(0, step - 1)) -
    Math.min(1, Math.max(0, step - 2)) * 0.5
}

function markerFootprint(selected: boolean, zoomScale: number, cluster = true) {
  const radius = selected ? mapMarkerGeometry.selectedRadius : mapMarkerGeometry.radius
  const stroke = selected ? mapMarkerGeometry.selectedStroke : mapMarkerGeometry.focusStroke
  const scale = mapMarkerScale(zoomScale)
  return [
    { x: 0, y: 0, radius: radius + stroke / 2 },
    ...(cluster ? [{
      x: mapMarkerGeometry.indicatorX,
      y: mapMarkerGeometry.indicatorY,
      radius: mapMarkerGeometry.indicatorRadius + mapMarkerGeometry.indicatorStroke / 2,
    }] : []),
  ].map((circle) => ({ x: circle.x * scale, y: circle.y * scale, radius: circle.radius * scale }))
}

export function mapMarkerRadius(selected = false, zoomScale = 1, cluster = true) {
  return Math.max(...markerFootprint(selected, zoomScale, cluster).map((circle) =>
    Math.hypot(circle.x, circle.y) + circle.radius))
}

function footprintsOverlap(
  a: MapPoint, aFootprint: ReturnType<typeof markerFootprint>,
  b: MapPoint, bFootprint: ReturnType<typeof markerFootprint>,
) {
  return aFootprint.some((first) => bFootprint.some((second) =>
    (a.x + first.x - b.x - second.x) ** 2 +
    (a.y + first.y - b.y - second.y) ** 2 <
    (first.radius + second.radius + mapMarkerGeometry.gap) ** 2))
}

// Fixed anchors avoid joining a whole coastline through a chain of neighbours.
// First reserve rim badges, then release unused space without moving any anchor.
export function groupMapPoints<T extends MapPoint>(
  points: readonly T[],
  radius: number,
  selectedId = '',
  zoomScale = 1,
): MapPointGroup<T>[] {
  const distance = Math.max(radius, mapMarkerRadius(true, zoomScale) * 2 + mapMarkerGeometry.gap)
  const normalFootprint = markerFootprint(false, zoomScale)
  const selectedFootprint = markerFootprint(true, zoomScale)
  const normalSingle = markerFootprint(false, zoomScale, false)
  const selectedSingle = markerFootprint(true, zoomScale, false)
  const footprint = (point: T, cluster: boolean) => point.id === selectedId
    ? cluster ? selectedFootprint : selectedSingle
    : cluster ? normalFootprint : normalSingle
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
    let closestDistance = Number.POSITIVE_INFINITY
    for (let x = column - 1; x <= column + 1; x++) {
      for (let y = row - 1; y <= row + 1; y++) {
        for (const group of cells.get(`${point.territory}:${x}:${y}`) ?? []) {
          const squared = (group.anchor.x - point.x) ** 2 + (group.anchor.y - point.y) ** 2
          const overlaps = squared < radius * radius ||
            footprintsOverlap(group.anchor, footprint(group.anchor, true), point, footprint(point, true))
          // Neighbours cannot steal choices from the selected anchor as the map zooms.
          if (overlaps &&
            (group.anchor.id === selectedId || (closest?.anchor.id !== selectedId && squared < closestDistance))) {
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

  const canSplit = (source: MapPointGroup<T>, members: T[]) => groups.every((other) =>
    !footprintsOverlap(members[0], footprint(members[0], members.length > 1),
      other.anchor, footprint(other.anchor,
        (other === source ? other.points.length - members.length : other.points.length) > 1)))
  const split = (source: MapPointGroup<T>, members: T[]) => {
    const ids = new Set(members.map((point) => point.id))
    source.points = source.points.filter((point) => !ids.has(point.id))
    groups.push({ anchor: members[0], points: members })
  }

  let changed = true
  while (changed) {
    changed = false
    for (const group of groups) {
      if (group.points.length < 2) continue
      for (const point of group.points) {
        if (point.id === group.anchor.id || !group.points.includes(point)) continue
        if (group.anchor.id === selectedId) {
          // This stronger, point-based check stays true at greater zoom, independent
          // of other groups changing their anchors or losing their badges.
          if (!sorted.every((other) => other.id === point.id ||
            !footprintsOverlap(point, normalSingle, other, footprint(other, true)))) continue
        } else {
          const members = [point, ...group.points.filter((other) =>
            other.id !== group.anchor.id && other.id !== point.id &&
            footprintsOverlap(point, normalSingle, other, footprint(other, false)))]
          if (members.length > 1 && canSplit(group, members)) {
            split(group, members)
            changed = true
            continue
          }
        }
        if (canSplit(group, [point])) {
          split(group, [point])
          changed = true
        }
      }
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
  groups: readonly MapPointGroup<T>[], selectedId: string,
): string[] {
  const group = groups.find((item) => item.points.some((point) => point.id === selectedId))
  if (!group || group.points.length < 2) return []
  return group.points.map((point) => point.id)
}
