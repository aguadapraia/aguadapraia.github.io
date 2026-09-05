import { geoMercator } from 'd3-geo'
import { zoomIdentity } from 'd3-zoom'
import { describe, expect, it } from 'vitest'
import {
  adaptiveClusterRadius,
  clusterZoomLevel,
  initialMapTransform,
  reframeMapTransform,
} from './map-transform'

describe('initialMapTransform', () => {
  it('does not crop geometry already fitted to its viewport', () => {
    expect(initialMapTransform()).toEqual(zoomIdentity)
  })
})

describe('reframeMapTransform', () => {
  const previousSize = { width: 900, height: 680 }
  const size = { width: 360, height: 760 }
  const previousProjection = geoMercator().scale(3000).translate([450, 340])
  const projection = geoMercator().scale(4800).translate([180, 380])

  it('keeps a reset map fitted rather than introducing a resize pan', () => {
    expect(reframeMapTransform(zoomIdentity, previousProjection, projection, previousSize, size)).toEqual(zoomIdentity)
  })

  it.each([1, 4, 16])('preserves the geographic centre and relative zoom at %sx', (scale) => {
    const old = zoomIdentity.translate(-200, 120).scale(scale)
    const center = previousProjection.invert!(old.invert([450, 340]))!
    const next = reframeMapTransform(old, previousProjection, projection, previousSize, size)
    const positioned = next.apply(projection(center)!)
    expect(positioned[0]).toBeCloseTo(size.width / 2, 7)
    expect(positioned[1]).toBeCloseTo(size.height / 2, 7)
    expect(next.k).toBe(scale)

    const restored = reframeMapTransform(next, projection, previousProjection, size, previousSize)
    expect(restored.x).toBeCloseTo(old.x, 7)
    expect(restored.y).toBeCloseTo(old.y, 7)
  })
})

describe('clusterZoomLevel', () => {
  it('does not count the initial scale as user zoom', () => {
    expect(clusterZoomLevel(1, 1, 6, 1.65)).toBe(6)
  })

  it('reveals another level per zoom button click', () => {
    expect(clusterZoomLevel(1.45, 1, 6, 1.65)).toBe(7)
    expect(clusterZoomLevel(1.45 ** 2, 1, 6, 1.65)).toBe(8)
    expect(clusterZoomLevel(1.45 ** 3, 1, 6, 1.65)).toBe(9)
  })
})

describe('adaptiveClusterRadius', () => {
  it('uses bounded pixel spacing without growing clusters as the user zooms in', () => {
    expect(adaptiveClusterRadius(18, 1, 1)).toBe(32)
    expect(adaptiveClusterRadius(36, 1, 1)).toBe(36)
    expect(adaptiveClusterRadius(36, 2, 1)).toBe(34)
    expect(adaptiveClusterRadius(36, 4, 1)).toBe(32)
    expect(adaptiveClusterRadius(100, 1, 1)).toBe(44)
    expect(adaptiveClusterRadius(18, 16, 1)).toBe(32)
  })

})
