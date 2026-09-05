import { describe, expect, it, vi } from 'vitest'
import { loadBoundedEvolution } from './evolution-history'
import { calendarDayCount } from './evolution-period'

describe('Bounded evolution history', () => {
  it('loads the full archive sequentially with a maximum of 366 days per request', async () => {
    const controller = new AbortController()
    let inFlight = 0
    const load = vi.fn(async (start: string, end: string, signal: AbortSignal) => {
      expect(inFlight++).toBe(0)
      expect(signal).toBe(controller.signal)
      expect(calendarDayCount(start, end)).toBeLessThanOrEqual(366)
      await Promise.resolve()
      inFlight--
      return start
    })
    await expect(loadBoundedEvolution({
      start: '2024-01-01', end: '2026-01-02', signal: controller.signal,
      cache: new Map(), cacheKey: 'territory', load,
    })).resolves.toEqual(['2024-01-01', '2025-01-01', '2026-01-02'])
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('reuses successful chunks on retry without caching a failed request', async () => {
    const cache = new Map<string, string>()
    const options = {
      start: '2024-01-01', end: '2025-01-01',
      signal: new AbortController().signal, cache, cacheKey: 'beaches',
    }
    const load = vi.fn<(start: string, end: string, signal: AbortSignal) => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('second')
    await expect(loadBoundedEvolution({ ...options, load })).rejects.toThrow('offline')
    await expect(loadBoundedEvolution({ ...options, load })).resolves.toEqual(['first', 'second'])
    expect(load).toHaveBeenCalledTimes(3)
    expect(load.mock.calls[2][0]).toBe('2025-01-01')
  })

  it('stops before the next chunk and does not cache an aborted response', async () => {
    const controller = new AbortController()
    const cache = new Map<string, string>()
    const load = vi.fn(async () => {
      controller.abort()
      return 'stale'
    })
    await expect(loadBoundedEvolution({
      start: '2024-01-01', end: '2025-01-01', signal: controller.signal,
      cache, cacheKey: 'territory', load,
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(load).toHaveBeenCalledTimes(1)
    expect(cache.size).toBe(0)
  })

  it('does not start requests for an already aborted selection', async () => {
    const controller = new AbortController()
    controller.abort()
    const load = vi.fn(async () => 'unused')
    await expect(loadBoundedEvolution({
      start: '2024-01-01', end: '2024-01-01', signal: controller.signal,
      cache: new Map(), cacheKey: 'territory', load,
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(load).not.toHaveBeenCalled()
  })
})
