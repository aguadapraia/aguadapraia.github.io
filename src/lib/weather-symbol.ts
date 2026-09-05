export type WeatherKind = 'clear' | 'partial' | 'cloudy' | 'rain' | 'fog' | 'snow' | 'storm' | 'hail' | 'frost' | 'unknown'

// IPMA weather-type-classe.json; unspecified conditions must not imply rain.
export function weatherKind(id: number): WeatherKind {
  if (id === 1) return 'clear'
  if ([2, 3, 25].includes(id)) return 'partial'
  if ([4, 5, 24, 27].includes(id)) return 'cloudy'
  if (id >= 6 && id <= 15) return 'rain'
  if ([16, 17, 26].includes(id)) return 'fog'
  if ([18, 28, 29, 30].includes(id)) return 'snow'
  if ([19, 20, 23].includes(id)) return 'storm'
  if (id === 21) return 'hail'
  if (id === 22) return 'frost'
  return 'unknown'
}

export function weatherLabel(kind: WeatherKind, language: 'pt' | 'en'): string {
  const labels = {
    clear: ['Céu limpo', 'Clear sky'],
    partial: ['Parcialmente nublado', 'Partly cloudy'],
    cloudy: ['Nublado', 'Cloudy'],
    rain: ['Chuva', 'Rain'],
    fog: ['Nevoeiro ou neblina', 'Fog or mist'],
    snow: ['Neve', 'Snow'],
    storm: ['Trovoada', 'Thunderstorms'],
    hail: ['Granizo', 'Hail'],
    frost: ['Geada', 'Frost'],
    unknown: ['Sem informação meteorológica', 'No weather information'],
  } as const
  return labels[kind][language === 'pt' ? 0 : 1]
}

export interface WeatherObstacle {
  x: number
  y: number
  width: number
  height: number
}

export const weatherBadgeSize = { width: 66, height: 38 }

export function placeWeatherBadges<T extends { x: number; y: number }>(
  points: readonly T[],
  viewport: { width: number; height: number },
  obstacles: readonly WeatherObstacle[],
  maxDisplacement = 12,
): Array<T & { anchorX: number; anchorY: number }> {
  const placed: Array<T & { anchorX: number; anchorY: number }> = []
  const occupied = [...obstacles]
  const { width, height } = weatherBadgeSize
  const margin = 4
  if (viewport.width < width + margin * 2 || viewport.height < height + margin * 2) return placed

  const offsets: Array<[number, number]> = [[0, 0]]
  for (let distance = 4; distance <= maxDisplacement; distance += 4) {
    for (let direction = 0; direction < 8; direction++) {
      const angle = direction * Math.PI / 4
      offsets.push([Math.cos(angle) * distance, Math.sin(angle) * distance])
    }
  }
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
        point.x < 0 || point.x > viewport.width || point.y < 0 || point.y > viewport.height) continue
    let accepted = false
    for (const [dx, dy] of offsets) {
      const x = Math.max(width / 2 + margin, Math.min(viewport.width - width / 2 - margin, point.x + dx))
      const y = Math.max(height / 2 + margin, Math.min(viewport.height - height / 2 - margin, point.y + dy))
      if (Math.hypot(x - point.x, y - point.y) > maxDisplacement) continue
      if (occupied.some((other) =>
        Math.abs(x - other.x) < (width + other.width) / 2 + margin &&
        Math.abs(y - other.y) < (height + other.height) / 2 + margin,
      )) continue
      placed.push({ ...point, x, y, anchorX: point.x, anchorY: point.y })
      occupied.push({ x, y, width, height })
      accepted = true
      break
    }
    // Keep district identity over collision avoidance; never move labels to another district.
    if (!accepted && point.x >= width / 2 + margin && point.x <= viewport.width - width / 2 - margin &&
      point.y >= height / 2 + margin && point.y <= viewport.height - height / 2 - margin &&
      !placed.some((other) => Math.abs(point.x - other.x) < width + margin && Math.abs(point.y - other.y) < height + margin)) {
      placed.push({ ...point, anchorX: point.x, anchorY: point.y })
      occupied.push({ ...point, width, height })
    }
  }
  return placed
}
