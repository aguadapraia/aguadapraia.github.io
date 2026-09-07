interface RequestEntry<T> {
  promise: Promise<T>
  controller: AbortController
  consumers: number
  expiresAt: number
  settled: boolean
  value?: T
}

export class RequestCache<T> {
  private readonly entries = new Map<string, RequestEntry<T>>()
  private readonly pending = new Map<string, RequestEntry<T>>()
  private readonly maximum: number
  private readonly ttlMs: number

  constructor(maximum = 24, ttlMs = 60_000) {
    this.maximum = maximum
    this.ttlMs = ttlMs
  }

  peek(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  get(key: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason)
    let entry = this.pending.get(key) ?? this.entries.get(key)
    if (entry && entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      entry = undefined
    }
    if (!entry) {
      if (this.pending.size >= this.maximum) return Promise.reject(new Error('Too many active data requests; try again'))
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(new DOMException('Data request timed out', 'TimeoutError')), 30_000)
      const created: RequestEntry<T> = {
        promise: Promise.resolve().then(() => {
          if (controller.signal.aborted) throw controller.signal.reason
          return load(controller.signal)
        }),
        controller, consumers: 0, expiresAt: Infinity, settled: false,
      }
      created.promise = created.promise.then((value) => {
        created.settled = true
        created.value = value
        created.expiresAt = Date.now() + this.ttlMs
        if (this.pending.get(key) === created) {
          this.pending.delete(key)
          this.entries.set(key, created)
          while (this.entries.size > this.maximum) this.entries.delete(this.entries.keys().next().value!)
        }
        return value
      }, (error: unknown) => {
        created.settled = true
        if (this.pending.get(key) === created) this.pending.delete(key)
        throw error
      }).finally(() => clearTimeout(timeout))
      entry = created
      this.pending.set(key, entry)
    } else if (entry.settled) {
      this.entries.delete(key)
      this.entries.set(key, entry)
    }
    return this.subscribe(key, entry, signal)
  }

  private subscribe(key: string, entry: RequestEntry<T>, signal?: AbortSignal): Promise<T> {
    entry.consumers++
    return new Promise<T>((resolve, reject) => {
      let finished = false
      const release = () => {
        if (finished) return false
        finished = true
        signal?.removeEventListener('abort', abort)
        entry.consumers--
        return true
      }
      const abort = () => {
        if (!release()) return
        reject(signal?.reason)
        // A prefetch and a visible view can share this request independently.
        if (!entry.settled && entry.consumers === 0) {
          if (this.pending.get(key) === entry) this.pending.delete(key)
          entry.controller.abort()
        }
      }
      signal?.addEventListener('abort', abort, { once: true })
      entry.promise.then(
        (value) => { if (release()) resolve(value) },
        (error: unknown) => { if (release()) reject(error) },
      )
    })
  }
}
