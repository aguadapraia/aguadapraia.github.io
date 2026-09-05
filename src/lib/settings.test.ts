import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSettings, saveSettings, STORAGE_KEY } from './settings'

type StorageState = Record<string, string>

function createLocalStorage(state: StorageState) {
  return {
    getItem: (key: string) => state[key] ?? null,
    setItem: (key: string, value: string) => { state[key] = value },
    removeItem: (key: string) => { delete state[key] },
    clear: () => { Object.keys(state).forEach((key) => delete state[key]) },
  }
}

describe('settings', () => {
  beforeEach(() => {
    const storageState: StorageState = {}
    vi.stubGlobal('localStorage', createLocalStorage(storageState))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the exact storage key aguadapraia:preferences', () => {
    expect(STORAGE_KEY).toBe('aguadapraia:preferences')
  })

  it('returns defaults when localStorage is empty', () => {
    const settings = loadSettings()
    expect(settings).toEqual({
      language: 'pt',
      theme: 'light',
      windUnit: 'kmh',
      mapMetric: 'water',
      territory: 'mainland',
    })
  })

  it('does not derive defaults from the DOM or system', () => {
    vi.stubGlobal('document', {
      documentElement: { getAttribute: () => 'dark' },
    })
    expect(loadSettings().theme).toBe('light')
  })

  it('persists and restores every valid setting', () => {
    saveSettings({
      language: 'en',
      theme: 'dark',
      windUnit: 'knots',
      mapMetric: 'air',
      territory: 'azores',
    })
    const settings = loadSettings()
    expect(settings).toEqual({
      language: 'en',
      theme: 'dark',
      windUnit: 'knots',
      mapMetric: 'air',
      territory: 'azores',
    })
  })

  it('migrates valid old preferences without territory to mainland', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      language: 'en',
      theme: 'dark',
      windUnit: 'knots',
      mapMetric: 'air',
    }))
    expect(loadSettings()).toEqual({
      language: 'en',
      theme: 'dark',
      windUnit: 'knots',
      mapMetric: 'air',
      territory: 'mainland',
    })

  })

  it('persists the wind map without discarding other preferences', () => {
    saveSettings({ ...loadSettings(), mapMetric: 'wind' })
    expect(loadSettings().mapMetric).toBe('wind')
  })

  it('ignores invalid stored data and returns defaults', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ language: 'xx', theme: 'rainbow' }))
    const settings = loadSettings()
    expect(settings.language).toBe('pt')
    expect(settings.theme).toBe('light')
    expect(settings.mapMetric).toBe('water')
    expect(settings.territory).toBe('mainland')
  })

  it('handles JSON parse errors gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')
    expect(() => loadSettings()).not.toThrow()
  })
})
