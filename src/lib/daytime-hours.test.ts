import { describe, expect, it } from 'vitest'
import { daytimeReadings, hasHourlyAir } from './daytime-hours'

describe('daytimeReadings', () => {
  it('keeps the inclusive 08:00-18:00 window', () => {
    const readings = [7, 8, 12, 18, 19].map((hour) => ({
      hour,
      waterTemperatureCelsius: 19,
      windKnots: 8,
      windDirection: 'N',
    }))

    expect(daytimeReadings(readings).map((reading) => reading.hour)).toEqual([
      8,
      12,
      18,
    ])
  })

  it('preserves nullable values within the daytime window', () => {
    expect(
      daytimeReadings([
        {
          hour: 10,
          waterTemperatureCelsius: null,
          windKnots: null,
          windDirection: null,
        },
      ]),
    ).toHaveLength(1)
  })

  it('recognizes real hourly air without inventing legacy or missing readings', () => {
    const reading = { hour: 8, waterTemperatureCelsius: null, windKnots: null, windDirection: null }
    expect(hasHourlyAir([{ ...reading, airTemperatureCelsius: 0 }])).toBe(true)
    for (const airTemperatureCelsius of [null, undefined, NaN, Infinity]) {
      expect(hasHourlyAir([{ ...reading, airTemperatureCelsius }])).toBe(false)
    }
    expect(hasHourlyAir([{ ...reading, hour: 7, airTemperatureCelsius: 20 }])).toBe(false)
  })
})
