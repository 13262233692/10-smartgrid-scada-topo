import type {
  TelemetryUpdate,
  TelemetryMetrics,
  AlarmRecord,
  StatusChangeEvent,
  DeviceStatus,
} from '../types/index.js'
import { STREAM_KEYS, CONSUMER_GROUPS } from '../types/index.js'
import { redisService } from './redisService.js'
import { topologyData } from '../data/topology.js'

const MAX_HISTORY = 1000
const POLL_INTERVAL_MS = 200
const BATCH_SIZE = 50
const PENDING_CLAIM_INTERVAL_MS = 5000
const MAX_PENDING_IDLE_MS = 3000
const MAX_RETRY_PER_MESSAGE = 3
const DEAD_LETTER_STREAM = 'stream:dead-letter'

interface StreamStats {
  processed: number
  acked: number
  dropped: number
  deadLettered: number
  retries: number
  lastProcessedId: string
}

class TelemetryService {
  private latest: Map<string, TelemetryUpdate> = new Map()
  private history: Map<string, TelemetryUpdate[]> = new Map()
  private alarms: AlarmRecord[] = []
  private statusChanges: StatusChangeEvent[] = []
  private alarmIdCounter = 0
  private sseConnections: Set<any> = new Set()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private claimTimer: ReturnType<typeof setInterval> | null = null
  private running = false
  private consumerName = `scada-main-consumer`
  private retryCounts: Map<string, number> = new Map()
  private deviceStatusCache: Map<string, DeviceStatus> = new Map()
  private stats: StreamStats = {
    processed: 0,
    acked: 0,
    dropped: 0,
    deadLettered: 0,
    retries: 0,
    lastProcessedId: '0-0',
  }
  private statusStats = {
    processed: 0,
    acked: 0,
    dropped: 0,
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true

    console.log(`[Telemetry] Starting stream consumer: ${this.consumerName}`)

    await redisService.streamCreateGroup(STREAM_KEYS.TELEMETRY, CONSUMER_GROUPS.TELEMETRY_PROCESSOR)
    await redisService.streamCreateGroup(STREAM_KEYS.STATUS_CHANGES, CONSUMER_GROUPS.STATUS_MONITOR)
    await redisService.streamCreateGroup(STREAM_KEYS.ALARMS, CONSUMER_GROUPS.ALARM_DISPATCHER)

    await this.recoverPending()

    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS)
    this.claimTimer = setInterval(() => this.claimStale(), PENDING_CLAIM_INTERVAL_MS)

    console.log('[Telemetry] Stream consumer started')
  }

  stop(): void {
    this.running = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.claimTimer) {
      clearInterval(this.claimTimer)
      this.claimTimer = null
    }
    console.log('[Telemetry] Stream consumer stopped')
  }

  isRunning(): boolean {
    return this.running
  }

  getStats(): StreamStats {
    return { ...this.stats }
  }

  getStatusStats() {
    return { ...this.statusStats }
  }

  getConsumerName(): string {
    return this.consumerName
  }

  async recoverPending(): Promise<void> {
    console.log('[Telemetry] Recovering pending messages...')

    let telemetryRecovered = 0
    let statusRecovered = 0
    let alarmRecovered = 0

    while (true) {
      const count = await this.pollTelemetry('0')
      if (count === 0) break
      telemetryRecovered += count
    }

    while (true) {
      const count = await this.pollStatusChanges('0')
      if (count === 0) break
      statusRecovered += count
    }

    while (true) {
      const count = await this.pollAlarms('0')
      if (count === 0) break
      alarmRecovered += count
    }

    console.log(`[Telemetry] Recovered ${telemetryRecovered} telemetry, ${statusRecovered} status changes, ${alarmRecovered} alarms from pending`)
  }

  async publishTelemetry(update: TelemetryUpdate): Promise<string> {
    return redisService.streamAdd(STREAM_KEYS.TELEMETRY, {
      type: 'telemetry',
      nodeId: update.nodeId,
      metrics: JSON.stringify(update.metrics),
      timestamp: String(update.timestamp),
      quality: update.quality,
    })
  }

  async publishStatusChange(event: StatusChangeEvent): Promise<string> {
    return redisService.streamAdd(STREAM_KEYS.STATUS_CHANGES, {
      type: 'status_change',
      nodeId: event.nodeId,
      nodeName: event.nodeName,
      fromStatus: event.fromStatus ?? '',
      toStatus: event.toStatus,
      reason: event.reason,
      priority: event.priority,
      timestamp: String(Date.now()),
    })
  }

  async publishAlarm(alarm: AlarmRecord): Promise<string> {
    return redisService.streamAdd(STREAM_KEYS.ALARMS, {
      type: 'alarm',
      alarmId: alarm.id,
      nodeId: alarm.nodeId,
      nodeName: alarm.nodeName,
      level: alarm.level,
      message: alarm.message,
      timestamp: String(alarm.timestamp),
      acknowledged: String(alarm.acknowledged),
    })
  }

  private async poll(): Promise<void> {
    if (!this.running) return

    try {
      await this.pollTelemetry()
      await this.pollStatusChanges()
      await this.pollAlarms()
    } catch (err: any) {
      console.warn('[Telemetry] Poll error:', err.message)
    }
  }

  private async pollTelemetry(fromId: string = '>'): Promise<number> {
    const messages = await redisService.streamReadGroup(
      STREAM_KEYS.TELEMETRY,
      CONSUMER_GROUPS.TELEMETRY_PROCESSOR,
      this.consumerName,
      BATCH_SIZE,
      fromId
    )

    if (!messages.length) return 0

    const ackIds: string[] = []
    const deadLetterIds: string[] = []

    for (const msg of messages) {
      const streamId = msg.id
      const retryCount = this.retryCounts.get(streamId) || 0

      try {
        const update: TelemetryUpdate = {
          nodeId: msg.fields.nodeId,
          metrics: JSON.parse(msg.fields.metrics || '{}'),
          timestamp: Number(msg.fields.timestamp) || Date.now(),
          quality: msg.fields.quality as any || 'good',
        }
        this.processTelemetryUpdate(update)
        this.stats.processed++
        this.stats.lastProcessedId = streamId
        ackIds.push(streamId)
      } catch (err: any) {
        console.warn(`[Telemetry] Failed to process ${streamId}:`, err.message)
        if (retryCount >= MAX_RETRY_PER_MESSAGE) {
          console.error(`[Telemetry] Max retries exceeded for ${streamId}, dead lettering`)
          deadLetterIds.push(streamId)
          await this.sendToDeadLetter(STREAM_KEYS.TELEMETRY, streamId, msg.fields)
        } else {
          this.retryCounts.set(streamId, retryCount + 1)
          this.stats.retries++
        }
      }
    }

    if (ackIds.length) {
      await redisService.streamAck(STREAM_KEYS.TELEMETRY, CONSUMER_GROUPS.TELEMETRY_PROCESSOR, ...ackIds)
      this.stats.acked += ackIds.length
    }

    if (deadLetterIds.length) {
      await redisService.streamAck(STREAM_KEYS.TELEMETRY, CONSUMER_GROUPS.TELEMETRY_PROCESSOR, ...deadLetterIds)
      this.stats.deadLettered += deadLetterIds.length
    }

    return messages.length
  }

  private async pollStatusChanges(fromId: string = '>'): Promise<number> {
    const messages = await redisService.streamReadGroup(
      STREAM_KEYS.STATUS_CHANGES,
      CONSUMER_GROUPS.STATUS_MONITOR,
      this.consumerName,
      BATCH_SIZE,
      fromId
    )

    if (!messages.length) return 0

    const ackIds: string[] = []

    for (const msg of messages) {
      try {
        const event: StatusChangeEvent = {
          nodeId: msg.fields.nodeId,
          nodeName: msg.fields.nodeName,
          fromStatus: (msg.fields.fromStatus as DeviceStatus) || null,
          toStatus: msg.fields.toStatus as DeviceStatus,
          reason: msg.fields.reason,
          priority: msg.fields.priority as any,
        }
        this.processStatusChange(event)
        this.statusStats.processed++
        ackIds.push(msg.id)
      } catch (err: any) {
        console.warn(`[Telemetry] Status change error ${msg.id}:`, err.message)
      }
    }

    if (ackIds.length) {
      await redisService.streamAck(STREAM_KEYS.STATUS_CHANGES, CONSUMER_GROUPS.STATUS_MONITOR, ...ackIds)
      this.statusStats.acked += ackIds.length
    }

    return messages.length
  }

  private async pollAlarms(fromId: string = '>'): Promise<number> {
    const messages = await redisService.streamReadGroup(
      STREAM_KEYS.ALARMS,
      CONSUMER_GROUPS.ALARM_DISPATCHER,
      this.consumerName,
      BATCH_SIZE,
      fromId
    )

    if (!messages.length) return 0

    const ackIds: string[] = []

    for (const msg of messages) {
      try {
        const alarm: AlarmRecord = {
          id: msg.fields.alarmId || msg.id,
          nodeId: msg.fields.nodeId,
          nodeName: msg.fields.nodeName,
          level: msg.fields.level as any,
          message: msg.fields.message,
          timestamp: Number(msg.fields.timestamp) || Date.now(),
          acknowledged: msg.fields.acknowledged === 'true',
        }
        this.alarms.unshift(alarm)
        if (this.alarms.length > 500) this.alarms.length = 500
        this.broadcastSSE({ type: 'alarm', alarm })
        ackIds.push(msg.id)
      } catch (err: any) {
        console.warn(`[Telemetry] Alarm error ${msg.id}:`, err.message)
      }
    }

    if (ackIds.length) {
      await redisService.streamAck(STREAM_KEYS.ALARMS, CONSUMER_GROUPS.ALARM_DISPATCHER, ...ackIds)
    }

    return messages.length
  }

  private async claimStale(): Promise<void> {
    if (!this.running) return

    try {
      const pendingInfo = await redisService.streamXPending(
        STREAM_KEYS.TELEMETRY,
        CONSUMER_GROUPS.TELEMETRY_PROCESSOR
      )

      if (!pendingInfo || pendingInfo.pending === 0) return

      const consumerPending = pendingInfo.consumers
        .filter((c) => c.name !== this.consumerName && c.pending > 0)

      if (consumerPending.length === 0) return

      console.log(`[Telemetry] Found stale pending from ${consumerPending.length} other consumers`)

      const staleIds: string[] = []
      for (const c of consumerPending) {
        const detail = await redisService.streamXPending(
          STREAM_KEYS.TELEMETRY,
          CONSUMER_GROUPS.TELEMETRY_PROCESSOR
        )
        if (detail?.minId && detail.minId !== '0-0') {
          staleIds.push(detail.minId)
        }
      }

      if (staleIds.length) {
        const claimed = await redisService.streamClaim(
          STREAM_KEYS.TELEMETRY,
          CONSUMER_GROUPS.TELEMETRY_PROCESSOR,
          this.consumerName,
          MAX_PENDING_IDLE_MS,
          staleIds
        )
        if (claimed.length) {
          console.log(`[Telemetry] Claimed ${claimed.length} stale messages`)
        }
      }
    } catch (err: any) {
      console.warn('[Telemetry] Claim stale error:', err.message)
    }
  }

  private processTelemetryUpdate(update: TelemetryUpdate): void {
    this.latest.set(update.nodeId, update)

    if (!this.history.has(update.nodeId)) {
      this.history.set(update.nodeId, [])
    }
    const hist = this.history.get(update.nodeId)!
    hist.push(update)
    if (hist.length > MAX_HISTORY) {
      hist.splice(0, hist.length - MAX_HISTORY)
    }

    redisService.setLatest(update.nodeId, JSON.stringify(update)).catch(() => {})

    const newAlarms = this.checkAlarms(update)
    for (const alarm of newAlarms) {
      this.alarms.unshift(alarm)
      this.publishAlarm(alarm).catch(() => {})
    }
    if (this.alarms.length > 500) {
      this.alarms.length = 500
    }

    this.broadcastSSE({ type: 'telemetry', update, alarms: newAlarms })
  }

  private processStatusChange(event: StatusChangeEvent): void {
    this.statusChanges.unshift(event)
    if (this.statusChanges.length > 200) {
      this.statusChanges.length = 200
    }

    this.deviceStatusCache.set(event.nodeId, event.toStatus)

    if (event.priority === 'critical') {
      const alarm: AlarmRecord = {
        id: `alarm-status-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        nodeId: event.nodeId,
        nodeName: event.nodeName,
        level: 'critical',
        message: `设备状态变位: ${event.reason} (${event.fromStatus || '未知'} → ${event.toStatus})`,
        timestamp: Date.now(),
        acknowledged: false,
      }
      this.alarms.unshift(alarm)
      if (this.alarms.length > 500) this.alarms.length = 500
      this.publishAlarm(alarm).catch(() => {})
      this.broadcastSSE({ type: 'alarm', alarm })
    }

    this.broadcastSSE({ type: 'status_change', event })
  }

  private async sendToDeadLetter(sourceStream: string, streamId: string, fields: Record<string, string>): Promise<void> {
    await redisService.streamAdd(DEAD_LETTER_STREAM, {
      sourceStream,
      originalId: streamId,
      fields: JSON.stringify(fields),
      reason: 'max_retries_exceeded',
      timestamp: String(Date.now()),
    })
    this.stats.deadLettered++
  }

  processUpdate(update: TelemetryUpdate): void {
    this.publishTelemetry(update).catch(() => {})
  }

  getLatest(): Map<string, TelemetryUpdate> {
    return this.latest
  }

  getLatestForNode(nodeId: string): TelemetryUpdate | undefined {
    return this.latest.get(nodeId)
  }

  getHistory(nodeId: string): TelemetryUpdate[] {
    return this.history.get(nodeId) || []
  }

  getAlarms(): AlarmRecord[] {
    return this.alarms
  }

  getStatusChanges(): StatusChangeEvent[] {
    return this.statusChanges
  }

  generateAlarms(): AlarmRecord[] {
    const allAlarms: AlarmRecord[] = []
    for (const [nodeId, update] of this.latest) {
      allAlarms.push(...this.checkAlarms(update))
    }
    return allAlarms
  }

  addSSEConnection(res: any): void {
    this.sseConnections.add(res)
    res.on('close', () => {
      this.sseConnections.delete(res)
    })
  }

  getSSEConnections(): Set<any> {
    return this.sseConnections
  }

  private checkAlarms(update: TelemetryUpdate): AlarmRecord[] {
    const alarms: AlarmRecord[] = []
    const node = topologyData.nodes.find((n) => n.id === update.nodeId)
    const nodeName = node?.name || update.nodeId
    const m = update.metrics

    if (m.frequency != null && (m.frequency < 49.9 || m.frequency > 50.1)) {
      alarms.push(this.createAlarm(update.nodeId, nodeName, m.frequency < 49.9 ? 'warning' : 'critical',
        `频率异常: ${m.frequency.toFixed(3)}Hz`))
    }

    if (m.voltage != null && node?.ratings?.voltage != null) {
      const ratio = m.voltage / node.ratings.voltage
      if (ratio < 0.95 || ratio > 1.05) {
        alarms.push(this.createAlarm(update.nodeId, nodeName,
          ratio < 0.9 || ratio > 1.1 ? 'critical' : 'warning',
          `电压越限: ${m.voltage.toFixed(1)}kV (额定 ${node.ratings.voltage}kV)`))
      }
    }

    if (m.activePower != null && node?.ratings?.activePower != null) {
      const ratio = m.activePower / node.ratings.activePower
      if (ratio > 0.9) {
        alarms.push(this.createAlarm(update.nodeId, nodeName,
          ratio > 0.95 ? 'critical' : 'warning',
          `有功功率越限: ${m.activePower.toFixed(1)}MW (额定 ${node.ratings.activePower}MW)`))
      }
    }

    if (m.current != null && node?.ratings?.current != null) {
      const ratio = m.current / node.ratings.current
      if (ratio > 0.9) {
        alarms.push(this.createAlarm(update.nodeId, nodeName,
          ratio > 0.95 ? 'critical' : 'warning',
          `电流越限: ${m.current.toFixed(1)}A (额定 ${node.ratings.current}A)`))
      }
    }

    return alarms
  }

  private createAlarm(nodeId: string, nodeName: string, level: AlarmRecord['level'], message: string): AlarmRecord {
    return {
      id: `alarm-${++this.alarmIdCounter}`,
      nodeId,
      nodeName,
      level,
      message,
      timestamp: Date.now(),
      acknowledged: false,
    }
  }

  private broadcastSSE(data: { type: string; update?: TelemetryUpdate; alarms?: AlarmRecord[]; alarm?: AlarmRecord; event?: StatusChangeEvent }): void {
    const payload = `data: ${JSON.stringify(data)}\n\n`
    for (const res of this.sseConnections) {
      try {
        res.write(payload)
      } catch {
        this.sseConnections.delete(res)
      }
    }
  }
}

export const telemetryService = new TelemetryService()
