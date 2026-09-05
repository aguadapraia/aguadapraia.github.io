import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dataUrl,
  loadEvolutionBeachHistories,
  loadEvolutionDate,
  loadEvolutionSummary,
  loadTimelineIndex,
  loadBeachDataset,
  loadBeachDayDetail,
  resetDayDetailCache,
  resetEvolutionIndexCache,
} from './api'

afterEach(() => {
  vi.unstubAllGlobals()
  resetDayDetailCache()
  resetEvolutionIndexCache()
})

beforeEach(() => {
  resetDayDetailCache()
  resetEvolutionIndexCache()
})

function rawAir(forecastDate: string) {
  return {
    locationId: 1110600,
    beachId: '10',
    forecastDate,
    locationName: 'Lisboa',
    distanceKm: 1,
    minimumCelsius: 18,
    maximumCelsius: 28,
    locationLatitude: 38.766,
    locationLongitude: -9.1286,
    weatherTypeId: 1,
  }
}

function latestPayload() {
  return {
    generatedAt: '2026-07-26T10:00:00.000Z',
    forecastUpdatedAt: '2026-07-26T09:00:00.000Z',
    displayForecastDates: ['2026-07-26', '2026-07-27', '2026-07-28'],
    catalogSize: 155,
    availableBeachCount: 1,
    unavailableLocations: [],
    beaches: [{ id: '10', name: 'Carcavelos, Cascais', latitude: 38.68, longitude: -9.33 }],
    summaries: ['2026-07-26', '2026-07-27', '2026-07-28'].map((forecastDate) => ({
      beachId: '10',
      forecastDate,
      waterMinCelsius: 18,
      waterMinHour: 8,
      waterMaxCelsius: 21,
      waterMaxHour: 16,
      daytimeWindMinKnots: 5,
      daytimeWindMinHour: 9,
      daytimeWindMaxKnots: 12,
      daytimeWindMaxHour: 15,
      daytimeWindAverageKnots: 8,
      windAt13Knots: 9,
    })),
    airTemperatures: ['2026-07-26', '2026-07-27', '2026-07-28'].map(rawAir),
    districtWeather: [
      {
        locationId: 1110600,
        locationName: 'Lisboa',
        latitude: 38.766,
        longitude: -9.1286,
        forecastDate: '2026-07-26',
        minimumCelsius: 18,
        maximumCelsius: 28,
        weatherTypeId: 1,
      },
    ],
  }
}

function metadataPayload() {
  return [
    {
      id: '10',
      territory: 'mainland',
      district: 'Lisboa',
      municipality: 'Cascais',
      sourceLatitude: 38.68,
      sourceLongitude: -9.33,
      displayLatitude: 38.68,
      displayLongitude: -9.33,
    },
  ]
}

describe('published data loading', () => {
  it('uses rolling metadata and cache policies with legacy-compatible payloads', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const body = url === '/data/latest.json'
        ? latestPayload()
        : metadataPayload()
      return new Response(JSON.stringify(body))
    })
    vi.stubGlobal('fetch', fetchMock)

    const dataset = await loadBeachDataset()

    expect(dataset.forecastDates).toEqual([
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
    ])
    expect(dataset).toMatchObject({
      generatedAt: '2026-07-26T10:00:00.000Z',
      forecastUpdatedAt: '2026-07-26T09:00:00.000Z',
      historyDates: [],
    })
    expect(fetchMock.mock.calls).toEqual([
      ['/data/latest.json', { cache: 'default' }],
      ['/data/beach-metadata.json', { cache: 'force-cache' }],
    ])
  })

  it('derives display dates from air forecasts for older payloads', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === '/data/latest.json') {
        return new Response(
          JSON.stringify({
            generatedAt: '2026-07-25T10:00:00.000Z',
            catalogSize: 155,
            availableBeachCount: 0,
            unavailableLocations: [],
            beaches: [],
            summaries: [],
            airTemperatures: [
              rawAir('2026-07-27'),
              rawAir('2026-07-25'),
              rawAir('2026-07-26'),
              rawAir('2026-07-28'),
            ],
          }),
        )
      }
      return new Response('[]')
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadBeachDataset()).resolves.toMatchObject({
      forecastDates: ['2026-07-25', '2026-07-26', '2026-07-27'],
      forecastUpdatedAt: '2026-07-25T10:00:00.000Z',
    })
  })

  it('loadBeachDataset does not fetch history index or history files', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      new Response(
        JSON.stringify(
          String(input) === '/data/latest.json' ? latestPayload() : metadataPayload(),
        ),
      ))
    vi.stubGlobal('fetch', fetchMock)

    const dataset = await loadBeachDataset()

    expect(dataset.historyDates).toEqual([])
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/data/history/')),
    ).toBe(false)
  })

  it('loads the bounded date index separately without bulk history', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === '/data/latest.json') return new Response(JSON.stringify(latestPayload()))
      if (url === '/data/beach-metadata.json') {
        return new Response(JSON.stringify(metadataPayload()))
      }
      if (url === '/data/evolution/index.json') {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          dates: ['2026-07-24', '2026-07-25'],
          generatedAt: '2026-07-25T10:00:00.000Z',
        }))
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const index = await loadTimelineIndex()
    expect(index.dates).toEqual(['2026-07-24', '2026-07-25'])
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(['/data/evolution/index.json'])
  })

  it('rejects invalid published timestamps and empty display windows', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === '/data/latest.json') {
        return new Response(
          JSON.stringify({
            generatedAt: 'invalid',
            displayForecastDates: [],
            catalogSize: 0,
            availableBeachCount: 0,
            unavailableLocations: [],
            beaches: [],
            summaries: [],
            airTemperatures: [],
          }),
        )
      }
      return new Response('[]')
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadBeachDataset()).rejects.toThrow()
  })
})


describe('beach day detail loading', () => {
  it('returns parsed data on a valid response', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          beachId: '10',
          date: '2026-07-29',
          updatedAt: '2026-07-29T08:00:00.000Z',
          air: { minimumCelsius: 18, maximumCelsius: 27 },
          summary: {
            waterMinCelsius: 18.5,
            waterMaxCelsius: 21.2,
            daytimeWindMinKnots: 4,
            daytimeWindAverageKnots: 8,
            daytimeWindMaxKnots: 12,
          },
          hourly: [
            {
              hour: 9,
              waterTemperatureCelsius: 19.2,
              windKnots: 7,
              windDirection: 'NW',
            },
          ],
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadBeachDayDetail('10', '2026-07-29')).resolves.toMatchObject({
      beachId: '10',
      date: '2026-07-29',
      hourly: [{ hour: 9, windDirection: 'NW', airTemperatureCelsius: null }],
    })
    expect(fetchMock).toHaveBeenCalledWith('/data/beach/10/day/2026-07-29.json', {
      cache: 'default',
    })
  })

  it('accepts additive UTC air readings and preserves genuine hourly gaps', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1, beachId: '10', date: '2026-07-29', updatedAt: '2026-07-29T08:00:00.000Z',
      hourlyTimeZone: 'UTC', air: { minimumCelsius: 18, maximumCelsius: 27 }, summary: null,
      hourly: [20, null, 0].map((airTemperatureCelsius, index) => ({
        hour: 8 + index, airTemperatureCelsius, waterTemperatureCelsius: null, windKnots: null, windDirection: null,
      })),
    }))))
    const detail = await loadBeachDayDetail('10', '2026-07-29')
    expect(detail.hourlyTimeZone).toBe('UTC')
    expect(detail.hourly.map((reading) => reading.airTemperatureCelsius)).toEqual([20, null, 0])
  })

  it('rejects malformed hourly air rather than silently converting values', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1, beachId: '10', date: '2026-07-29', updatedAt: '2026-07-29T08:00:00.000Z',
      air: null, summary: null,
      hourly: [{ hour: 8, airTemperatureCelsius: '20', waterTemperatureCelsius: null, windKnots: null, windDirection: null }],
    }))))
    await expect(loadBeachDayDetail('10', '2026-07-29')).rejects.toThrow()
  })

  it('throws on non-ok response with beach id, date, and status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))

    await expect(loadBeachDayDetail('10', '2026-07-29')).rejects.toThrow(
      'Beach day detail unavailable: 10/2026-07-29 (404)',
    )
  })

  it('throws on schema validation failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            beachId: '10',
            date: '2026-07-29',
            updatedAt: '2026-07-29T08:00:00.000Z',
            air: null,
            summary: null,
            hourly: [{ hour: 25, waterTemperatureCelsius: null, windKnots: null, windDirection: null }],
          }),
        ),
      ),
    )

    await expect(loadBeachDayDetail('10', '2026-07-29')).rejects.toThrow()
  })

  it('deduplicates concurrent requests for the same day detail', async () => {
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      await Promise.resolve()
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          beachId: '10',
          date: '2026-07-29',
          updatedAt: '2026-07-29T08:00:00.000Z',
          air: null,
          summary: null,
          hourly: [],
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const [first, second] = await Promise.all([
      loadBeachDayDetail('10', '2026-07-29'),
      loadBeachDayDetail('10', '2026-07-29'),
    ])

    expect(first).toEqual(second)
    expect(calls).toBe(1)
  })

  it('evicts failed requests so a retry works', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            beachId: '10',
            date: '2026-07-29',
            updatedAt: '2026-07-29T08:00:00.000Z',
            air: null,
            summary: null,
            hourly: [],
          }),
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadBeachDayDetail('10', '2026-07-29')).rejects.toThrow(
      'Beach day detail unavailable: 10/2026-07-29 (500)',
    )
    await expect(loadBeachDayDetail('10', '2026-07-29')).resolves.toMatchObject({
      date: '2026-07-29',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refreshes current and future detail after sixty seconds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T12:00:00.000Z'))
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          beachId: '10',
          date: '2026-07-29',
          updatedAt: '2026-07-29T08:00:00.000Z',
          air: null,
          summary: null,
          hourly: [],
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await loadBeachDayDetail('10', '2026-07-29')
    vi.advanceTimersByTime(60_001)
    await loadBeachDayDetail('10', '2026-07-29')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('bounded evolution loading', () => {
  it('loads a server-computed territory summary', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      new Response(JSON.stringify({
        schemaVersion: 1,
        start: '2026-07-25',
        end: '2026-07-31',
        dates: ['2026-07-25'],
        aggregates: [{
          date: '2026-07-25',
          water: { min: 17, avg: 19, max: 21, coverage: 1 },
          air: null,
          wind: null,
        }],
        generatedAt: '2026-07-31T10:00:00.000Z',
      })),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await loadEvolutionSummary(
      '2026-07-25',
      '2026-07-31',
      'mainland',
    )
    expect(result.aggregates).toHaveLength(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/data/evolution/summary.json?start=2026-07-25&end=2026-07-31&territory=mainland',
    )
  })

  it('loads one historical map date and selected beach histories', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        schemaVersion: 1,
        date: '2026-07-25',
        points: [{ beachId: '10', date: '2026-07-25', waterMax: 20 }],
        generatedAt: '2026-07-31T10:00:00.000Z',
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        schemaVersion: 1,
        start: '2026-07-25',
        end: '2026-07-31',
        histories: [{
          beachId: '10',
          points: [{ beachId: '10', date: '2026-07-25', waterMax: 20 }],
        }],
        generatedAt: '2026-07-31T10:00:00.000Z',
      })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      loadEvolutionDate('2026-07-25', 'mainland'),
    ).resolves.toMatchObject({ date: '2026-07-25' })
    await expect(
      loadEvolutionBeachHistories(
        ['10'],
        '2026-07-25',
        '2026-07-31',
      ),
    ).resolves.toMatchObject({
      histories: [{ beachId: '10' }],
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces bounded endpoint failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 429 })),
    )
    await expect(
      loadEvolutionBeachHistories(
        ['10'],
        '2026-07-25',
        '2026-07-31',
      ),
    ).rejects.toThrow('(429)')
  })
})

describe('dataUrl', () => {
  it('falls back to public asset path when API base is not set', () => {
    expect(dataUrl('latest.json', undefined, '/')).toBe('/data/latest.json')
    expect(dataUrl('evolution/index.json', undefined, '/')).toBe(
      '/data/evolution/index.json',
    )
  })

  it('strips .json suffix and prepends API base when configured', () => {
    expect(dataUrl('latest.json', '/api/data')).toBe('/api/data/latest')
    expect(dataUrl('evolution/index.json', '/api/data')).toBe(
      '/api/data/evolution/index',
    )
    expect(
      dataUrl(
        'evolution/summary.json?start=2026-07-25&end=2026-07-31',
        '/api/data',
      ),
    ).toBe(
      '/api/data/evolution/summary?start=2026-07-25&end=2026-07-31',
    )
  })

  it('handles trailing slash in API base', () => {
    expect(dataUrl('latest.json', '/api/data/')).toBe('/api/data/latest')
  })
})
