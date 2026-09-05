import { zoomIdentity, type ZoomTransform } from 'd3-zoom'
import type { GeoProjection } from 'd3-geo'

// Fallback dimensions before ResizeObserver measures the mounted map.
export const mapWidth = 900
export const mapHeight = 680

// The projection fits the actual viewport; an extra mobile zoom would crop land.
export function initialMapTransform(): ZoomTransform {
  return zoomIdentity
}

export function reframeMapTransform(
  transform: ZoomTransform,
  previousProjection: GeoProjection,
  projection: GeoProjection,
  previousSize: { width: number; height: number },
  size: { width: number; height: number },
): ZoomTransform {
  if (transform.k === 1 && transform.x === 0 && transform.y === 0) {
    return zoomIdentity
  }
  const center = previousProjection.invert?.(
    transform.invert([previousSize.width / 2, previousSize.height / 2]),
  )
  const point = center && projection(center)
  if (!point || !point.every(Number.isFinite)) return zoomIdentity
  return zoomIdentity
    .translate(size.width / 2 - point[0] * transform.k, size.height / 2 - point[1] * transform.k)
    .scale(transform.k)
}

export function clusterZoomLevel(
  scale: number,
  initialScale: number,
  baseZoom: number,
  zoomRate: number,
): number {
  return Math.min(
    16,
    Math.max(
      0,
      Math.log2(scale / initialScale) * zoomRate + baseZoom,
    ),
  )
}

export function adaptiveClusterRadius(
  baseRadius: number,
  scale: number,
  initialScale: number,
): number {
  const zoomSteps = Math.max(0, Math.log2(scale / initialScale))
  return Math.max(0, Math.min(44, baseRadius) - zoomSteps * 2)
}
