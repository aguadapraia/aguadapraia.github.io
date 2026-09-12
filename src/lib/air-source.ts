import type { BeachViewModel, DailyBeachForecast } from '../types'
import { shortBeachName } from './beach-name'
import { normalizeBeachSearch } from './beach-search'

function localityName(name: string) {
  return normalizeBeachSearch(shortBeachName(name.split(',')[0]))
}

export function isLocalAirForecast(
  beach: Pick<BeachViewModel, 'name'>,
  forecast: Pick<DailyBeachForecast, 'airLocation' | 'airDistanceKm' | 'airMatchType'>,
): boolean {
  if (forecast.airDistanceKm > 5 || forecast.airMatchType === 'nearby-beach') return false
  if (forecast.airMatchType === 'exact-beach' || forecast.airMatchType === 'exact-location') return true
  if (localityName(beach.name) !== localityName(forecast.airLocation)) return false
  // City-named locations can use their own municipal forecast without an exact-match tag.
  return forecast.airMatchType === 'municipality' ||
    forecast.airMatchType === undefined
}
