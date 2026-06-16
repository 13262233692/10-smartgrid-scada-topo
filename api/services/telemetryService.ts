import type { TelemetryUpdate, TelemetryMetrics, AlarmRecord } from '../types/index.js'
import { redisService } from './redisService.js'
import { topologyData } from '../data/topology.js'

const MAX_HISTORY = 1000

class TelemetryService {
  private latest: Map<string, TelemetryUpdate> = new Map()
  private history: Map<string, TelemetryUpdate[]> = new Map()
  private alarms: AlarmRecord[] = []
  private alarmIdCounter = 0
  private sseConnections: Set<any> = new Set()

  async processUpdate(update: TelemetryUpdate): Promise<void> {
    this.latest.set(update.nodeId, update)

    if (!this.history.has(update.nodeId)) {
      this.history.set(update.nodeId, [])
    }
    const hist = this.history.get(update.nodeId)!
    hist.push(update)
    if (hist.length > MAX_HISTORY) {
      hist.splice(0, hist.length - MAX_HISTORY)
    }

    await redisService.setLatest(update.nodeId, JSON.stringify(update))

    const newAlarms = this.checkAlarms(update)
    for (const alarm of newAlarms) {
      this.alarms.unshift(alarm)
    }
    if (this.alarms.length > 500) {
      this.alarms.length = 500
    }

    this.broadcastSSE(update, newAlarms)
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

  private broadcastSSE(update: TelemetryUpdate, newAlarms: AlarmRecord[]): void {
    const data = JSON.stringify({ type: 'telemetry', update, alarms: newAlarms })
    const payload = `data: ${data}\n\n`
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
