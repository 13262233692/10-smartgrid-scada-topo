import { topologyData } from '../data/topology.js'
import type { TelemetryUpdate, TelemetryMetrics, StatusChangeEvent, DeviceStatus } from '../types/index.js'
import { telemetryService } from './telemetryService.js'

class IEC104Simulator {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private highLoadTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private highLoadMode = false
  private messageCount = 0
  private lastUpdate = 0
  private deviceStatuses: Map<string, DeviceStatus> = new Map()
  private statusChangeCount = 0
  private tripCount = 0

  constructor() {
    for (const node of topologyData.nodes) {
      if (node.type === 'breaker') {
        this.deviceStatuses.set(node.id, node.status || 'on')
      }
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    console.log('[IEC104] Simulator started')

    const tick = () => {
      if (!this.running) return

      const nodes = topologyData.nodes.filter(
        (n) => n.type === 'line' || n.type === 'generator' || n.type === 'transformer' || n.type === 'busbar'
      )

      const highLoadMultiplier = this.highLoadMode ? 1.15 : 1

      for (const node of nodes) {
        const metrics = this.generateMetrics(node.type, node.ratings, highLoadMultiplier)
        const update: TelemetryUpdate = {
          nodeId: node.id,
          metrics,
          timestamp: Date.now(),
          quality: 'good',
        }

        this.messageCount++
        this.lastUpdate = Date.now()

        telemetryService.publishTelemetry(update).catch(() => {})
      }

      if (Math.random() < 0.02 && this.highLoadMode) {
        this.simulateRandomTrip()
      }

      if (Math.random() < 0.005) {
        this.simulateStatusFluctuation()
      }
    }

    tick()
    this.intervalId = setInterval(tick, 1500)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.highLoadTimer) {
      clearTimeout(this.highLoadTimer)
      this.highLoadTimer = null
    }
    this.running = false
    console.log('[IEC104] Simulator stopped')
  }

  enableHighLoadMode(durationMs = 30000): void {
    this.highLoadMode = true
    console.log('[IEC104] High load oscillation mode ENABLED')

    if (this.highLoadTimer) {
      clearTimeout(this.highLoadTimer)
    }

    this.highLoadTimer = setTimeout(() => {
      this.highLoadMode = false
      console.log('[IEC104] High load oscillation mode disabled')
    }, durationMs)
  }

  isRunning(): boolean {
    return this.running
  }

  getStatus() {
    return {
      running: this.running,
      messageCount: this.messageCount,
      lastUpdate: this.lastUpdate,
      highLoadMode: this.highLoadMode,
      statusChangeCount: this.statusChangeCount,
      tripCount: this.tripCount,
    }
  }

  getDeviceStatus(deviceId: string): DeviceStatus | undefined {
    return this.deviceStatuses.get(deviceId)
  }

  async triggerBreakerTrip(breakerId: string, reason = '保护动作跳闸'): Promise<string> {
    const breaker = topologyData.nodes.find((n) => n.id === breakerId && n.type === 'breaker')
    if (!breaker) {
      throw new Error(`Breaker not found: ${breakerId}`)
    }

    const fromStatus = this.deviceStatuses.get(breakerId) || 'on'
    const toStatus: DeviceStatus = 'off'
    this.deviceStatuses.set(breakerId, toStatus)
    this.tripCount++

    const event: StatusChangeEvent = {
      nodeId: breakerId,
      nodeName: breaker.name,
      fromStatus: fromStatus as DeviceStatus,
      toStatus,
      reason,
      priority: 'critical',
    }

    const streamId = await telemetryService.publishStatusChange(event)
    this.statusChangeCount++

    console.log(`[IEC104] CRITICAL: ${breaker.name} 跳闸 (${fromStatus} → ${toStatus}), streamId=${streamId}`)

    return streamId
  }

  async triggerBreakerClose(breakerId: string, reason = '遥控合闸'): Promise<string> {
    const breaker = topologyData.nodes.find((n) => n.id === breakerId && n.type === 'breaker')
    if (!breaker) {
      throw new Error(`Breaker not found: ${breakerId}`)
    }

    const fromStatus = this.deviceStatuses.get(breakerId) || 'off'
    const toStatus: DeviceStatus = 'on'
    this.deviceStatuses.set(breakerId, toStatus)

    const event: StatusChangeEvent = {
      nodeId: breakerId,
      nodeName: breaker.name,
      fromStatus: fromStatus as DeviceStatus,
      toStatus,
      reason,
      priority: 'high',
    }

    const streamId = await telemetryService.publishStatusChange(event)
    this.statusChangeCount++

    console.log(`[IEC104] ${breaker.name} 合闸 (${fromStatus} → ${toStatus}), streamId=${streamId}`)

    return streamId
  }

  private simulateRandomTrip(): void {
    const breakers = topologyData.nodes.filter(
      (n) => n.type === 'breaker' && this.deviceStatuses.get(n.id) !== 'off'
    )
    if (breakers.length === 0) return

    const breaker = breakers[Math.floor(Math.random() * breakers.length)]
    const fromStatus = this.deviceStatuses.get(breaker.id) || 'on'

    this.deviceStatuses.set(breaker.id, 'off')
    this.tripCount++

    const event: StatusChangeEvent = {
      nodeId: breaker.id,
      nodeName: breaker.name,
      fromStatus,
      toStatus: 'off',
      reason: '过流保护跳闸',
      priority: 'critical',
    }

    telemetryService.publishStatusChange(event).catch(() => {})
    this.statusChangeCount++

    console.log(`[IEC104] ⚡ 模拟跳闸: ${breaker.name}`)

    setTimeout(() => {
      if (!this.running) return
      this.deviceStatuses.set(breaker.id, 'on')
      const restoreEvent: StatusChangeEvent = {
        nodeId: breaker.id,
        nodeName: breaker.name,
        fromStatus: 'off',
        toStatus: 'on',
        reason: '自动重合闸成功',
        priority: 'high',
      }
      telemetryService.publishStatusChange(restoreEvent).catch(() => {})
      this.statusChangeCount++
      console.log(`[IEC104] 🔄 重合闸: ${breaker.name}`)
    }, 3000 + Math.random() * 5000)
  }

  private simulateStatusFluctuation(): void {
    const breakers = topologyData.nodes.filter((n) => n.type === 'breaker')
    if (breakers.length === 0) return

    const breaker = breakers[Math.floor(Math.random() * breakers.length)]
    const currentStatus = this.deviceStatuses.get(breaker.id) || 'on'
    if (currentStatus === 'fault') return

    const event: StatusChangeEvent = {
      nodeId: breaker.id,
      nodeName: breaker.name,
      fromStatus: currentStatus,
      toStatus: currentStatus,
      reason: '状态校核',
      priority: 'normal',
    }

    telemetryService.publishStatusChange(event).catch(() => {})
    this.statusChangeCount++
  }

  private generateMetrics(
    type: string,
    ratings?: { current?: number; voltage?: number; activePower?: number; reactivePower?: number },
    loadMultiplier = 1
  ): TelemetryMetrics {
    const jitter = (base: number, pct: number): number => {
      const range = base * pct
      return base + (Math.random() - 0.5) * 2 * range
    }

    switch (type) {
      case 'busbar':
        return {
          voltage: jitter(ratings?.voltage ?? 220, 0.02),
          frequency: jitter(50, 0.001),
        }
      case 'line':
        return {
          voltage: jitter(ratings?.voltage ?? 220, 0.02),
          current: jitter((ratings?.current ?? 1000) * loadMultiplier, 0.05),
          activePower: jitter((ratings?.activePower ?? 150) * loadMultiplier, 0.05),
          reactivePower: jitter((ratings?.reactivePower ?? 30) * loadMultiplier, 0.08),
          frequency: jitter(50, 0.001),
        }
      case 'generator':
        return {
          voltage: jitter(ratings?.voltage ?? 220, 0.015),
          current: jitter((ratings?.current ?? 800) * loadMultiplier, 0.04),
          activePower: jitter((ratings?.activePower ?? 200) * loadMultiplier, 0.04),
          reactivePower: jitter((ratings?.reactivePower ?? 50) * loadMultiplier, 0.06),
          frequency: jitter(50, 0.0008),
        }
      case 'transformer':
        return {
          voltage: jitter(ratings?.voltage ?? 220, 0.018),
          current: jitter((ratings?.current ?? 1250) * loadMultiplier, 0.05),
          activePower: jitter((ratings?.activePower ?? 240) * loadMultiplier, 0.04),
          reactivePower: jitter((ratings?.reactivePower ?? 60) * loadMultiplier, 0.07),
          frequency: jitter(50, 0.001),
        }
      default:
        return {
          voltage: jitter(220, 0.02),
          frequency: jitter(50, 0.001),
        }
    }
  }
}

export const iec104Simulator = new IEC104Simulator()
