import { evolutionRequestChunks } from './evolution-period'

/** Complete one bounded public request at a time; successful chunks survive a retry. */
export async function loadBoundedEvolution<T>({
  start, end, signal, cache, cacheKey, load,
}: {
  start: string
  end: string
  signal: AbortSignal
  cache: Map<string, T>
  cacheKey: string
  load: (start: string, end: string, signal: AbortSignal) => Promise<T>
}): Promise<T[]> {
  const chunks = evolutionRequestChunks(start, end)
  if (!chunks.length) throw new RangeError('Invalid evolution period')
  const values: T[] = []
  for (const chunk of chunks) {
    signal.throwIfAborted()
    const key = `${cacheKey}|${chunk.start}|${chunk.end}`
    let value = cache.get(key)
    if (value === undefined) {
      value = await load(chunk.start, chunk.end, signal)
      signal.throwIfAborted()
      cache.set(key, value)
      if (cache.size > 24) cache.delete(cache.keys().next().value!)
    }
    values.push(value)
  }
  signal.throwIfAborted()
  return values
}
