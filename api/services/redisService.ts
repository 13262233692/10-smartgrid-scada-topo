import Redis from 'ioredis'

class RedisService {
  private client: Redis | null = null
  private fallbackStore: Map<string, string> = new Map()
  private fallbackSubscribers: Map<string, Set<(message: string) => void>> = new Map()
  private isUsingFallback = false
  private connecting = false

  async connect(): Promise<void> {
    if (this.client || this.connecting) return
    this.connecting = true

    try {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => {
          if (times > 3) {
            console.warn('[Redis] Max retries reached, switching to in-memory fallback')
            this.isUsingFallback = true
            this.client = null
            return null
          }
          return Math.min(times * 200, 2000)
        },
        lazyConnect: true,
      })

      this.client.on('error', (err) => {
        if (!this.isUsingFallback) {
          console.warn('[Redis] Connection error, using in-memory fallback:', err.message)
          this.isUsingFallback = true
        }
      })

      this.client.on('connect', () => {
        console.log('[Redis] Connected successfully')
        this.isUsingFallback = false
      })

      await this.client.connect()
    } catch (err: any) {
      console.warn('[Redis] Failed to connect, using in-memory fallback:', err.message)
      this.isUsingFallback = true
      this.client = null
    } finally {
      this.connecting = false
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    if (this.isUsingFallback || !this.client) {
      const subscribers = this.fallbackSubscribers.get(channel)
      if (subscribers) {
        for (const cb of subscribers) {
          try { cb(message) } catch {}
        }
      }
      return
    }
    try {
      await this.client.publish(channel, message)
    } catch (err: any) {
      console.warn('[Redis] Publish failed:', err.message)
      const subscribers = this.fallbackSubscribers.get(channel)
      if (subscribers) {
        for (const cb of subscribers) { try { cb(message) } catch {} }
      }
    }
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (this.isUsingFallback || !this.client) {
      if (!this.fallbackSubscribers.has(channel)) {
        this.fallbackSubscribers.set(channel, new Set())
      }
      this.fallbackSubscribers.get(channel)!.add(callback)
      return
    }
    try {
      const subClient = this.client.duplicate()
      await subClient.connect()
      subClient.on('message', (ch: string, message: string) => {
        if (ch === channel) {
          callback(message)
        }
      })
      await subClient.subscribe(channel)
    } catch (err: any) {
      console.warn('[Redis] Subscribe failed, using in-memory fallback:', err.message)
      if (!this.fallbackSubscribers.has(channel)) {
        this.fallbackSubscribers.set(channel, new Set())
      }
      this.fallbackSubscribers.get(channel)!.add(callback)
    }
  }

  async setLatest(nodeId: string, data: string): Promise<void> {
    if (this.isUsingFallback || !this.client) {
      this.fallbackStore.set(`telemetry:latest:${nodeId}`, data)
      return
    }
    try {
      await this.client.set(`telemetry:latest:${nodeId}`, data, 'EX', 300)
    } catch (err: any) {
      console.warn('[Redis] SET failed:', err.message)
      this.fallbackStore.set(`telemetry:latest:${nodeId}`, data)
    }
  }

  async getLatest(nodeId: string): Promise<string | null> {
    if (this.isUsingFallback || !this.client) {
      return this.fallbackStore.get(`telemetry:latest:${nodeId}`) || null
    }
    try {
      return await this.client.get(`telemetry:latest:${nodeId}`)
    } catch (err: any) {
      console.warn('[Redis] GET failed:', err.message)
      return this.fallbackStore.get(`telemetry:latest:${nodeId}`) || null
    }
  }

  getIsUsingFallback(): boolean {
    return this.isUsingFallback
  }
}

export const redisService = new RedisService()
