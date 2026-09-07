import { geoCentroid, geoContains, geoDistance, geoMercator, type GeoPermissibleObjects } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson'
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

export function islandWeatherAnchor(geometry: Geometry, location: [number, number]): [number, number] {
  const islands: Polygon[] = geometry.type === 'Polygon' ? [geometry]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }))
    : []
  if (!islands.length) throw new Error('Island weather requires polygon geometry')
  // Rounded coastal coordinates can fall just offshore; compare coastlines,
  // not centres, to avoid confusing neighbouring islands such as Pico and Faial.
  const island = islands.find((polygon) => geoContains(polygon, location)) ??
    islands.reduce((nearest, polygon) => {
      const distance = polygon.coordinates[0].reduce((minimum, point) =>
        Math.min(minimum, geoDistance(location, [point[0], point[1]])), Infinity)
      return distance < nearest.distance ? { polygon, distance } : nearest
    }, { polygon: islands[0], distance: Infinity }).polygon
  const centre = geoCentroid(island)
  return geoContains(island, centre) ? centre : location
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

export function mapMarkerFootprint(selected: boolean, zoomScale: number, cluster = true) {
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
  return Math.max(...mapMarkerFootprint(selected, zoomScale, cluster).map((circle) =>
    Math.hypot(circle.x, circle.y) + circle.radius))
}

function footprintsOverlap(
  a: MapPoint, aFootprint: ReturnType<typeof mapMarkerFootprint>,
  b: MapPoint, bFootprint: ReturnType<typeof mapMarkerFootprint>,
) {
  return aFootprint.some((first) => bFootprint.some((second) =>
    (a.x + first.x - b.x - second.x) ** 2 +
    (a.y + first.y - b.y - second.y) ** 2 <
    (first.radius + second.radius + mapMarkerGeometry.gap) ** 2))
}

// Reserve rim badges, release unused space, then split locally at real beaches.
// A selected anchor stays fixed; other anchors change only to expose more choices.
export function groupMapPoints<T extends MapPoint>(
  points: readonly T[],
  radius: number,
  selectedId = '',
  zoomScale = 1,
): MapPointGroup<T>[] {
  const distance = Math.max(radius, mapMarkerRadius(true, zoomScale) * 2 + mapMarkerGeometry.gap)
  const normalFootprint = mapMarkerFootprint(false, zoomScale)
  const selectedFootprint = mapMarkerFootprint(true, zoomScale)
  const normalSingle = mapMarkerFootprint(false, zoomScale, false)
  const selectedSingle = mapMarkerFootprint(true, zoomScale, false)
  const footprint = (point: T, cluster: boolean) => point.id === selectedId
    ? cluster ? selectedFootprint : selectedSingle
    : cluster ? normalFootprint : normalSingle
  const groups: MapPointGroup<T>[] = []
  const cells = new Map<string, MapPointGroup<T>[]>()
  const sorted = [...points].sort((a, b) => {
    if (a.id === b.id) return 0
    if (a.id === selectedId) return -1
    if (b.id === selectedId) return 1
    // Sweep geography rather than catalog IDs, which otherwise seed the middle
    // of neighbouring stretches and strand usable space between their anchors.
    return a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1)
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

  const repartition = (source: MapPointGroup<T>) => {
    if (source.anchor.id === selectedId) return false
    let minX = source.anchor.x, maxX = minX
    let minY = source.anchor.y, maxY = minY
    for (const point of source.points) {
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }
    if ((maxX - minX) ** 2 + (maxY - minY) ** 2 <
      (normalSingle[0].radius * 2 + mapMarkerGeometry.gap) ** 2) return false
    // An interior representative can block both ends of its own group. Bisect
    // at its farthest feasible pair, checking the badges after nearest assignment.
    // Only this group changes, and every accepted exchange adds a visible choice.
    const neighbours = groups.filter((other) => other !== source)
    const candidates = source.points.flatMap((point) => {
      if (neighbours.some((other) => footprintsOverlap(
        point, normalSingle, other.anchor, footprint(other.anchor, other.points.length > 1)))) return []
      return [{
        point,
        cluster: neighbours.every((other) => !footprintsOverlap(
          point, normalFootprint, other.anchor, footprint(other.anchor, other.points.length > 1))),
      }]
    })
    let best: [T[], T[]] | undefined
    let bestDistance = -1
    for (let first = 0; first < candidates.length; first++) {
      const a = candidates[first]
      for (let second = first + 1; second < candidates.length; second++) {
        const b = candidates[second]
        const squared = (a.point.x - b.point.x) ** 2 + (a.point.y - b.point.y) ** 2
        if (squared <= bestDistance ||
          footprintsOverlap(a.point, normalSingle, b.point, normalSingle)) continue
        const left = [a.point]
        const right = [b.point]
        for (const point of source.points) {
          if (point === a.point || point === b.point) continue
          const distanceA = (point.x - a.point.x) ** 2 + (point.y - a.point.y) ** 2
          const distanceB = (point.x - b.point.x) ** 2 + (point.y - b.point.y) ** 2
          if (distanceA <= distanceB) left.push(point)
          else right.push(point)
        }
        if ((left.length > 1 && !a.cluster) || (right.length > 1 && !b.cluster) ||
          footprintsOverlap(a.point, footprint(a.point, left.length > 1),
            b.point, footprint(b.point, right.length > 1))) continue
        best = [left, right]
        bestDistance = squared
      }
    }
    if (!best) return false
    source.anchor = best[0][0]
    source.points = best[0]
    groups.push({ anchor: best[1][0], points: best[1] })
    return true
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
      if (group.points.length > 1 && repartition(group)) changed = true
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
