import { topologyData } from '../data/topology.js'
import type { TelemetryUpdate, TelemetryMetrics } from '../types/index.js'
import { mqttClient } from './mqttClient.js'

class IEC104Simulator {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private running = false
  private messageCount = 0
  private lastUpdate = 0
  private callback: ((update: TelemetryUpdate) => void) | null = null

  onData(cb: (update: TelemetryUpdate) => void): void {
    this.callback = cb
  }

  start(): void {
    if (this.running) return
    this.running = true
    console.log('[IEC104] Simulator started')

    const tick = () => {
      const nodes = topologyData.nodes.filter(
        (n) => n.type === 'line' || n.type === 'generator' || n.type === 'transformer' || n.type === 'busbar'
      )

      for (const node of nodes) {
        const metrics = this.generateMetrics(node.type, node.ratings)
        const update: TelemetryUpdate = {
          nodeId: node.id,
          metrics,
          timestamp: Date.now(),
          quality: 'good',
        }

        this.messageCount++
        this.lastUpdate = Date.now()

        if (this.callback) {
          this.callback(update)
        }

        mqttClient.publish(
          `scada/telemetry/${node.id}`,
          JSON.stringify(update)
        )
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
    this.running = false
    console.log('[IEC104] Simulator stopped')
  }

  isRunning(): boolean {
    return this.running
  }

  getStatus() {
    return {
      running: this.running,
      messageCount: this.messageCount,
      lastUpdate: this.lastUpdate,
    }
  }

  private generateMetrics(
    type: string,
    ratings?: { current?: number; voltage?: number; activePower?: number; reactivePower?: number }
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
          current: jitter(ratings?.current ?? 1000, 0.05),
          activePower: jitter(ratings?.activePower ?? 150, 0.05),
          reactivePower: jitter(ratings?.reactivePower ?? 30, 0.08),
          frequency: jitter(50, 0.001),
        }
      case 'generator':
        return {
          voltage: jitter(ratings?.voltage ?? 220, 0.015),
          current: jitter(ratings?.current ?? 800, 0.04),
          activePower: jitter(ratings?.activePower ?? 200, 0.04),
          reactivePower: jitter(ratings?.reactivePower ?? 50, 0.06),
          frequency: jitter(50, 0.0008),
        }
      case 'transformer':
        return {
          voltage: jitter(ratings?.voltage ?? 220, 0.018),
          current: jitter(ratings?.current ?? 1250, 0.05),
          activePower: jitter(ratings?.activePower ?? 240, 0.04),
          reactivePower: jitter(ratings?.reactivePower ?? 60, 0.07),
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
