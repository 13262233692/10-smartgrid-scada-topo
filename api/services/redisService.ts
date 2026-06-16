import Redis from 'ioredis'
import { STREAM_KEYS } from '../types/index.js'

const MAX_STREAM_LENGTH = 10000
const MAX_PENDING_AGE_MS = 30000
const FALLBACK_ID_PREFIX = 'fb-'

interface FallbackStreamEntry {
  id: string
  fields: string[]
  delivered: boolean
  claimed: boolean
  claimTime: number
  groups: Map<string, { deliveredId: string; pending: Map<string, FallbackStreamEntry> }>
}

class RedisService {
  private client: Redis | null = null
  private fallbackStore: Map<string, string> = new Map()
  private fallbackSubscribers: Map<string, Set<(message: string) => void>> = new Map()
  private fallbackStreams: Map<string, FallbackStreamEntry[]> = new Map()
  private fallbackGroups: Map<string, Map<string, { lastDeliveredId: string; pending: Set<string> }>> = new Map()
  private fallbackIdCounter = 0
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
        enableOfflineQueue: false,
      })

      this.client.on('error', (err) => {
        if (!this.isUsingFallback) {
          console.warn('[Redis] Connection error, using in-memory fallback:', err.message)
          this.isUsingFallback = true
        }
      })

      this.client.on('connect', () => {
        console.log('[Redis] Connected successfully, restoring from fallback')
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

  async streamAdd(streamKey: string, fields: Record<string, string>, maxLen = MAX_STREAM_LENGTH): Promise<string> {
    if (this.isUsingFallback || !this.client) {
      return this.fallbackStreamAdd(streamKey, fields)
    }
    try {
      const fieldArr: string[] = []
      for (const [k, v] of Object.entries(fields)) {
        fieldArr.push(k, String(v))
      }
      const id = await this.client.xadd(streamKey, '*', ...fieldArr, 'MAXLEN', '~', maxLen)
      return id || '0-0'
    } catch (err: any) {
      console.warn('[Redis] XADD failed, falling back:', err.message)
      this.isUsingFallback = true
      return this.fallbackStreamAdd(streamKey, fields)
    }
  }

  async streamCreateGroup(streamKey: string, groupName: string, fromId = '0'): Promise<void> {
    if (this.isUsingFallback || !this.client) {
      this.fallbackCreateGroup(streamKey, groupName)
      return
    }
    try {
      await this.client.xgroup('CREATE', streamKey, groupName, fromId, 'MKSTREAM')
    } catch (err: any) {
      if (!err.message.includes('BUSYGROUP')) {
        console.warn(`[Redis] XGROUP CREATE ${streamKey} ${groupName}:`, err.message)
      }
    }
  }

  async streamReadGroup(
    streamKey: string,
    groupName: string,
    consumerName: string,
    count: number,
    fromId = '>'
  ): Promise<{ id: string; fields: Record<string, string> }[]> {
    if (this.isUsingFallback || !this.client) {
      return this.fallbackReadGroup(streamKey, groupName, consumerName, count, fromId)
    }
    try {
      const result = await this.client.xreadgroup(
        'GROUP',
        groupName,
        consumerName,
        'COUNT',
        count,
        'BLOCK',
        0,
        'STREAMS',
        streamKey,
        fromId
      ) as Array<[string, Array<[string, string[]]>]> | null

      if (!result || result.length === 0) return []

      const messages: { id: string; fields: Record<string, string> }[] = []
      for (const [, entries] of result) {
        for (const [id, fieldArr] of entries) {
          const fields: Record<string, string> = {}
          for (let i = 0; i < fieldArr.length; i += 2) {
            fields[fieldArr[i]] = fieldArr[i + 1]
          }
          messages.push({ id, fields })
        }
      }
      return messages
    } catch (err: any) {
      console.warn('[Redis] XREADGROUP failed:', err.message)
      return []
    }
  }

  async streamAck(streamKey: string, groupName: string, ...ids: string[]): Promise<number> {
    if (!ids.length) return 0
    if (this.isUsingFallback || !this.client) {
      return this.fallbackAck(streamKey, groupName, ...ids)
    }
    try {
      const count = await this.client.xack(streamKey, groupName, ...ids)
      return count ?? 0
    } catch (err: any) {
      console.warn('[Redis] XACK failed:', err.message)
      return 0
    }
  }

  async streamXPending(streamKey: string, groupName: string): Promise<{
    pending: number
    minId: string
    maxId: string
    consumers: { name: string; pending: number }[]
  } | null> {
    if (this.isUsingFallback || !this.client) {
      return this.fallbackXPending(streamKey, groupName)
    }
    try {
      const result = await this.client.xpending(streamKey, groupName) as any
      if (!result) return null
      return {
        pending: result.pending ?? result[0] ?? 0,
        minId: result.minId ?? result[1] ?? '0-0',
        maxId: result.maxId ?? result[2] ?? '0-0',
        consumers: (result.consumers ?? result[3] ?? []).map((c: any) => ({
          name: c.name ?? c[0],
          pending: c.pending ?? c[1],
        })),
      }
    } catch (err: any) {
      console.warn('[Redis] XPENDING failed:', err.message)
      return null
    }
  }

  async streamClaim(
    streamKey: string,
    groupName: string,
    consumerName: string,
    minIdleTime: number,
    ids: string[]
  ): Promise<string[]> {
    if (!ids.length) return []
    if (this.isUsingFallback || !this.client) {
      return this.fallbackClaim(streamKey, groupName, consumerName, minIdleTime, ids)
    }
    try {
      const result = await this.client.xclaim(
        streamKey,
        groupName,
        consumerName,
        minIdleTime,
        ...ids,
        'JUSTID'
      ) as string[]
      return result || []
    } catch (err: any) {
      console.warn('[Redis] XCLAIM failed:', err.message)
      return []
    }
  }

  async streamInfo(streamKey: string): Promise<{ length: number; firstEntry?: string; lastEntry?: string } | null> {
    if (this.isUsingFallback || !this.client) {
      const entries = this.fallbackStreams.get(streamKey) || []
      return {
        length: entries.length,
        firstEntry: entries[0]?.id,
        lastEntry: entries[entries.length - 1]?.id,
      }
    }
    try {
      const info = await this.client.xinfo('STREAM', streamKey) as any
      return {
        length: info?.length ?? 0,
        firstEntry: info?.['first-entry']?.[0],
        lastEntry: info?.['last-entry']?.[0],
      }
    } catch {
      return null
    }
  }

  async streamTrim(streamKey: string, maxLen: number): Promise<number> {
    if (this.isUsingFallback || !this.client) {
      const entries = this.fallbackStreams.get(streamKey)
      if (!entries) return 0
      const removed = Math.max(0, entries.length - maxLen)
      if (removed > 0) {
        entries.splice(0, removed)
      }
      return removed
    }
    try {
      const trimmed = await this.client.xtrim(streamKey, 'MAXLEN', '~', maxLen)
      return trimmed ?? 0
    } catch {
      return 0
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

  getClient(): Redis | null {
    return this.client
  }

  private fallbackStreamAdd(streamKey: string, fields: Record<string, string>): string {
    if (!this.fallbackStreams.has(streamKey)) {
      this.fallbackStreams.set(streamKey, [])
    }
    const entries = this.fallbackStreams.get(streamKey)!
    const id = `${FALLBACK_ID_PREFIX}${Date.now()}-${this.fallbackIdCounter++}`
    const fieldArr: string[] = []
    for (const [k, v] of Object.entries(fields)) {
      fieldArr.push(k, v)
    }
    entries.push({
      id,
      fields: fieldArr,
      delivered: false,
      claimed: false,
      claimTime: 0,
      groups: new Map(),
    })
    return id
  }

  private fallbackCreateGroup(streamKey: string, groupName: string): void {
    const key = `${streamKey}:${groupName}`
    if (!this.fallbackGroups.has(key)) {
      this.fallbackGroups.set(key, new Map())
    }
  }

  private fallbackReadGroup(
    streamKey: string,
    groupName: string,
    consumerName: string,
    count: number,
    fromId: string
  ): { id: string; fields: Record<string, string> }[] {
    const entries = this.fallbackStreams.get(streamKey) || []
    if (!entries.length) return []

    const groupKey = `${streamKey}:${groupName}`
    if (!this.fallbackGroups.has(groupKey)) {
      this.fallbackGroups.set(groupKey, new Map())
    }
    const group = this.fallbackGroups.get(groupKey)!
    if (!group.has(consumerName)) {
      group.set(consumerName, { lastDeliveredId: '0-0', pending: new Set() })
    }
    const consumer = group.get(consumerName)!

    const result: { id: string; fields: Record<string, string> }[] = []

    if (fromId === '0') {
      for (const entry of entries) {
        if (consumer.pending.has(entry.id) && result.length < count) {
          const fields: Record<string, string> = {}
          for (let i = 0; i < entry.fields.length; i += 2) {
            fields[entry.fields[i]] = entry.fields[i + 1]
          }
          result.push({ id: entry.id, fields })
        }
      }
      return result
    }

    let startReading = consumer.lastDeliveredId === '0-0'
    for (const entry of entries) {
      if (result.length >= count) break

      if (!startReading) {
        if (entry.id === consumer.lastDeliveredId) {
          startReading = true
        }
        continue
      }

      const fieldMap: Record<string, string> = {}
      for (let i = 0; i < entry.fields.length; i += 2) {
        fieldMap[entry.fields[i]] = entry.fields[i + 1]
      }
      result.push({ id: entry.id, fields: fieldMap })
      consumer.pending.add(entry.id)
      consumer.lastDeliveredId = entry.id
    }
    return result
  }

  private fallbackAck(streamKey: string, groupName: string, ...ids: string[]): number {
    const groupKey = `${streamKey}:${groupName}`
    const group = this.fallbackGroups.get(groupKey)
    if (!group) return 0

    let acked = 0
    for (const consumer of group.values()) {
      for (const id of ids) {
        if (consumer.pending.delete(id)) {
          acked++
        }
      }
    }
    return acked
  }

  private fallbackXPending(streamKey: string, groupName: string): {
    pending: number
    minId: string
    maxId: string
    consumers: { name: string; pending: number }[]
  } | null {
    const groupKey = `${streamKey}:${groupName}`
    const group = this.fallbackGroups.get(groupKey)
    if (!group) return null

    let totalPending = 0
    let minId = '0-0'
    let maxId = '0-0'
    const consumers: { name: string; pending: number }[] = []

    for (const [name, consumer] of group.entries()) {
      const pendingCount = consumer.pending.size
      consumers.push({ name, pending: pendingCount })
      totalPending += pendingCount
      if (pendingCount > 0) {
        const pendingIds = Array.from(consumer.pending).sort()
        if (minId === '0-0' || pendingIds[0] < minId) minId = pendingIds[0]
        if (pendingIds[pendingIds.length - 1] > maxId) maxId = pendingIds[pendingIds.length - 1]
      }
    }

    return { pending: totalPending, minId, maxId, consumers }
  }

  private fallbackClaim(
    streamKey: string,
    groupName: string,
    consumerName: string,
    minIdleTime: number,
    ids: string[]
  ): string[] {
    const groupKey = `${streamKey}:${groupName}`
    const group = this.fallbackGroups.get(groupKey)
    if (!group) return []

    if (!group.has(consumerName)) {
      group.set(consumerName, { lastDeliveredId: '0-0', pending: new Set() })
    }
    const targetConsumer = group.get(consumerName)!

    const claimed: string[] = []
    for (const id of ids) {
      for (const [otherName, otherConsumer] of group.entries()) {
        if (otherName !== consumerName && otherConsumer.pending.has(id)) {
          otherConsumer.pending.delete(id)
          targetConsumer.pending.add(id)
          claimed.push(id)
          break
        }
      }
    }
    return claimed
  }
}

export const redisService = new RedisService()
