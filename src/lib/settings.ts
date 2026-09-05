import { z } from 'zod'
import type { SettingsMapMetric, TerritoryFilter } from '../types'

const SettingsSchema = z.object({
  language: z.enum(['pt', 'en']),
  theme: z.enum(['light', 'dark']),
  windUnit: z.enum(['kmh', 'knots']),
  mapMetric: z.enum(['water', 'air', 'wind']),
  territory: z.enum(['all', 'mainland', 'madeira', 'azores']),
})

export type Settings = Omit<z.infer<typeof SettingsSchema>, 'mapMetric' | 'territory'> & {
  mapMetric: SettingsMapMetric
  territory: TerritoryFilter
}

export const STORAGE_KEY = 'aguadapraia:preferences'

const DEFAULT_SETTINGS: Settings = {
  language: 'pt',
  theme: 'light',
  windUnit: 'kmh',
  mapMetric: 'water',
  territory: 'mainland',
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      const migrated = typeof parsed === 'object' && parsed !== null && !('territory' in parsed)
        ? { ...parsed, territory: 'mainland' }
        : parsed
      const result = SettingsSchema.safeParse(migrated)
      if (result.success) return result.data
      console.warn('Ignoring invalid AguaDaPraia preferences')
    }
  } catch (error) {
    console.warn('Unable to read AguaDaPraia preferences', error)
  }
  return DEFAULT_SETTINGS
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.warn('Unable to save AguaDaPraia preferences', error)
  }
}
