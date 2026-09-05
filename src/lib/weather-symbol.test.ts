import { describe, expect, it } from 'vitest'
import {
  placeWeatherBadges,
  weatherBadgeSize,
  weatherKind,
  weatherLabel,
  type WeatherObstacle,
} from './weather-symbol'

describe('IPMA weather symbols', () => {
  it('distinguishes hail and frost from rain', () => {
    expect(weatherKind(21)).toBe('hail')
    expect(weatherKind(22)).toBe('frost')
    expect(weatherKind(5)).toBe('cloudy')
  })

  describe('weather badge placement', () => {
    const viewport = { width: 390, height: 740 }
    const overlaps = (a: WeatherObstacle, b: WeatherObstacle) =>
      Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
      Math.abs(a.y - b.y) < (a.height + b.height) / 2

    it('keeps a crowded district at its anchor rather than moving it inland or offshore', () => {
      const beaches = Array.from({ length: 18 }, (_, index) => ({
        x: 90, y: 20 + index * 40, width: 48, height: 48,
      }))
      const points = [{ id: 'district', x: 90, y: 240 }]
      const placed = placeWeatherBadges(points, viewport, beaches, 12)
      expect(placed).toHaveLength(1)
      expect(placed[0].id).toBe('district')
      expect(placed[0].anchorX).toBe(90)
      expect(placed[0].anchorY).toBe(240)
      expect(placed[0].x).toBe(90)
      expect(placed[0].y).toBe(240)
      expect(points).toEqual([{ id: 'district', x: 90, y: 240 }])
    })

    it('hides coincident weather labels instead of spreading them outside their districts', () => {
      const points = [
        { id: 'a', x: 180, y: 200 },
        { id: 'b', x: 180, y: 200 },
        { id: 'c', x: 184, y: 208 },
      ]
      const beaches = [{ x: 180, y: 200, width: 48, height: 48 }]
      const placed = placeWeatherBadges(points, viewport, beaches)
      expect(placed).toHaveLength(1)
      expect(placeWeatherBadges(points, viewport, beaches)).toEqual(placed)
      const rectangles = placed.map((point) => ({ ...point, ...weatherBadgeSize }))
      for (let index = 0; index < rectangles.length; index++) {
        for (let other = index + 1; other < rectangles.length; other++) {
          expect(overlaps(rectangles[index], rectangles[other])).toBe(false)
        }
      }
    })

    it('uses only a small offset when that is enough to avoid a beach', () => {
      const points = [{ x: 150, y: 150 }]
      const beaches = [{ x: 197, y: 150, width: 24, height: 24 }]
      const placed = placeWeatherBadges(points, viewport, beaches, 8)
      expect(placed).toHaveLength(1)
      expect(Math.hypot(placed[0].x - 150, placed[0].y - 150)).toBeLessThanOrEqual(8)
      expect(overlaps({ ...placed[0], ...weatherBadgeSize }, beaches[0])).toBe(false)
    })

    it.each([
      { width: 320, height: 740 },
      { width: 740, height: 320 },
      { width: 1200, height: 680 },
    ])('keeps the complete symbol and both temperatures inside $width × $height', (size) => {
      const placed = placeWeatherBadges([
        { x: 34, y: 20 },
        { x: size.width - 34, y: size.height - 20 },
      ], size, [])
      expect(placed).toHaveLength(2)
      for (const point of placed) {
        expect(point.x - weatherBadgeSize.width / 2).toBeGreaterThanOrEqual(4)
        expect(point.y - weatherBadgeSize.height / 2).toBeGreaterThanOrEqual(4)
        expect(point.x + weatherBadgeSize.width / 2).toBeLessThanOrEqual(size.width - 4)
        expect(point.y + weatherBadgeSize.height / 2).toBeLessThanOrEqual(size.height - 4)
      }
    })

    it('declutters only when bounded placement is impossible and ignores offscreen anchors', () => {
      expect(placeWeatherBadges([{ x: 150, y: 150 }], viewport, [
        { x: 150, y: 150, width: 220, height: 220 },
      ], 12)).toMatchObject([{ x: 150, y: 150, anchorX: 150, anchorY: 150 }])
      expect(placeWeatherBadges([{ x: -1, y: 100 }, { x: Number.NaN, y: 10 }], viewport, [])).toEqual([])
      expect(placeWeatherBadges([{ x: 20, y: 20 }], { width: 40, height: 40 }, [])).toEqual([])
    })
  })

  it('covers every published condition without treating missing information as rain', () => {
    for (let id = 1; id <= 30; id++) expect(weatherKind(id)).not.toBe('unknown')
    for (const id of [-99, 0, 31, NaN]) expect(weatherKind(id)).toBe('unknown')
    for (const id of [18, 28, 29, 30]) expect(weatherKind(id)).toBe('snow')
    for (const id of [19, 20, 23]) expect(weatherKind(id)).toBe('storm')
  })

  it('describes the displayed symbol in the chosen language', () => {
    expect(weatherLabel(weatherKind(1), 'pt')).toBe('Céu limpo')
    expect(weatherLabel(weatherKind(21), 'en')).toBe('Hail')
    expect(weatherLabel(weatherKind(0), 'pt')).toBe('Sem informação meteorológica')
  })

})
