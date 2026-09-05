import districtGeometry from '../../public/geo/districts.geojson?raw'
import { geoPath } from 'd3-geo'
import type { FeatureCollection, Geometry } from 'geojson'
import { describe, expect, it } from 'vitest'
import {
  clusterClickScale,
  clusterChoiceIds,
  filterDistricts,
  fitMapProjection,
  groupMapPoints,
  mapFitExtent,
  prepareDistricts,
} from './map-layout'

const geometry = prepareDistricts(JSON.parse(districtGeometry) as FeatureCollection<Geometry>)

const viewports = [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 760, height: 360 },
  { width: 768, height: 1024 },
  { width: 1200, height: 680 },
  { width: 1920, height: 1080 },
  { width: 360, height: 320 },
  { width: 900, height: 420 },
]

describe('responsive territory fitting', () => {
  for (const territory of ['mainland', 'madeira', 'azores', 'all'] as const) {
    it.each(viewports)(`fits all ${territory} geometry at $width × $height without letterboxing`, (size) => {
      const collection = { ...geometry, features: filterDistricts(geometry.features, territory) }
      const projection = fitMapProjection(collection, size)
      const bounds = geoPath(projection).bounds(collection)
      const extent = mapFitExtent(size)
      expect(bounds[0][0]).toBeGreaterThanOrEqual(extent[0][0] - 0.01)
      expect(bounds[0][1]).toBeGreaterThanOrEqual(extent[0][1] - 0.01)
      expect(bounds[1][0]).toBeLessThanOrEqual(extent[1][0] + 0.01)
      expect(bounds[1][1]).toBeLessThanOrEqual(extent[1][1] + 0.01)
      const width = bounds[1][0] - bounds[0][0]
      const height = bounds[1][1] - bounds[0][1]
      expect(Math.max(width / size.width, height / size.height)).toBeGreaterThan(0.85)
      expect(Math.max(
        width / (extent[1][0] - extent[0][0]),
        height / (extent[1][1] - extent[0][1]),
      )).toBeCloseTo(1, 3)
      expect((bounds[0][0] + bounds[1][0]) / 2).toBeCloseTo((extent[0][0] + extent[1][0]) / 2, 3)
      expect((bounds[0][1] + bounds[1][1]) / 2).toBeCloseTo((extent[0][1] + extent[1][1]) / 2, 3)
    })
  }

  it('preserves every island polygon in the combined view', () => {
    expect(filterDistricts(geometry.features, 'all')).toHaveLength(geometry.features.length)
    expect(filterDistricts(geometry.features, 'madeira')[0]).toBe(geometry.features[0])
    expect(filterDistricts(geometry.features, 'azores')[0]).toBe(geometry.features[1])
    expect(filterDistricts(geometry.features, 'mainland')).toHaveLength(geometry.features.length - 2)
  })
})

describe('screen-space beach groups', () => {
  const points = [
    { id: 'a', territory: 'mainland', x: 0, y: 0 },
    { id: 'b', territory: 'mainland', x: 15, y: 0 },
    { id: 'c', territory: 'mainland', x: 40, y: 0 },
    { id: 'd', territory: 'mainland', x: 70, y: 0 },
  ]
  const ids = (input: typeof points, radius = 32, selectedId = '') =>
    groupMapPoints(input, radius, selectedId).map((group) => group.points.map((point) => point.id))

  it('is deterministic and does not chain a coastline into one cluster', () => {
    expect(ids(points)).toEqual([['a', 'b'], ['c', 'd']])
    expect(ids([...points].reverse())).toEqual(ids(points))
    expect(points[0].x).toBe(0)
  })

  it('reveals nearby beaches at a larger actual screen scale, regardless of territory', () => {
    for (const territory of ['mainland', 'madeira', 'azores']) {
      const input = points.map((point) => ({ ...point, territory }))
      expect(ids(input)).toHaveLength(2)
      expect(ids(input.map((point) => ({ ...point, x: point.x * 4 })))).toHaveLength(4)
    }
  })

  it('does not change groups on pan or merge different territories', () => {
    expect(ids(points.map((point) => ({ ...point, x: point.x - 119, y: point.y + 300 })))).toEqual(ids(points))
    expect(ids([
      { ...points[0], territory: 'azores' },
      { ...points[1], territory: 'madeira' },
    ])).toHaveLength(2)
  })

  it('keeps coincident beaches selectable, including neighbours of the selected beach at maximum zoom', () => {
    const coincident = points.map((point) => ({ ...point, x: 240, y: 320 }))
    const groups = groupMapPoints(coincident, 32, 'c')
    expect(groups).toHaveLength(1)
    expect(groups[0].anchor.id).toBe('c')
    expect(groups[0].points.map((point) => point.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(clusterChoiceIds(groups, 'c', true)).toHaveLength(4)
  })

  it('zooms by two steps without exceeding the limit', () => {
    expect(clusterClickScale(1, 16)).toBe(1.45 ** 2)
    expect(clusterClickScale(15, 16)).toBe(16)
    expect(clusterClickScale(16, 16)).toBe(16)
  })

  it('shows alternatives from the resulting small group, not the original larger cluster', () => {
    const group = groupMapPoints(points, 32, 'a')
    expect(clusterChoiceIds(group, 'a', false)).toEqual(['a', 'b'])
    const large = groupMapPoints(Array.from({ length: 6 }, (_, index) => ({
      id: String(index), territory: 'mainland', x: 0, y: 0,
    })), 32, '0')
    expect(clusterChoiceIds(large, '0', false)).toEqual([])
    expect(clusterChoiceIds(large, '0', true)).toHaveLength(6)
    expect(clusterChoiceIds(groupMapPoints([points[0]], 32), 'a', false)).toEqual([])
  })
})
