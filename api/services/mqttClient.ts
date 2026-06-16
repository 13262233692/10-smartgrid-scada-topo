import mqtt from 'mqtt'
import { redisService } from './redisService.js'
import { STREAM_KEYS } from '../types/index.js'

class MqttClientService {
  private client: mqtt.MqttClient | null = null
  private connected = false
  private messageCount = 0
  private lastUpdate = 0

  async connect(): Promise<void> {
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883'

    try {
      this.client = mqtt.connect(brokerUrl, {
        clientId: `scada-server-${Math.random().toString(16).slice(2, 8)}`,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 10000,
      })

      this.client.on('connect', () => {
        console.log('[MQTT] Connected to broker:', brokerUrl)
        this.connected = true
        this.client!.subscribe('scada/telemetry/#', { qos: 1 }, (err) => {
          if (err) {
            console.warn('[MQTT] Subscribe failed:', err.message)
          } else {
            console.log('[MQTT] Subscribed to scada/telemetry/#')
          }
        })
      })

      this.client.on('message', async (topic, payload) => {
        this.messageCount++
        this.lastUpdate = Date.now()
        const message = payload.toString()

        try {
          const parsed = JSON.parse(message)
          if (parsed.nodeId && parsed.metrics) {
            await redisService.streamAdd(STREAM_KEYS.TELEMETRY, {
              type: 'telemetry',
              nodeId: parsed.nodeId,
              metrics: JSON.stringify(parsed.metrics),
              timestamp: String(parsed.timestamp || Date.now()),
              quality: parsed.quality || 'good',
              source: 'mqtt',
              topic,
            })
          }
        } catch (err: any) {
          console.warn('[MQTT] Failed to parse message:', err.message)
          await redisService.streamAdd(STREAM_KEYS.TELEMETRY, {
            type: 'telemetry',
            raw: message,
            topic,
            timestamp: String(Date.now()),
            quality: 'invalid',
            source: 'mqtt',
          })
        }
      })

      this.client.on('error', (err) => {
        console.warn('[MQTT] Error:', err.message)
        this.connected = false
      })

      this.client.on('close', () => {
        console.warn('[MQTT] Connection closed')
        this.connected = false
      })

      this.client.on('offline', () => {
        this.connected = false
      })
    } catch (err: any) {
      console.warn('[MQTT] Failed to connect, running without MQTT:', err.message)
      this.connected = false
    }
  }

  async publish(topic: string, message: string, qos: 0 | 1 | 2 = 1): Promise<void> {
    if (!this.client || !this.connected) {
      return
    }
    return new Promise((resolve, reject) => {
      this.client!.publish(topic, message, { qos }, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  isConnected(): boolean {
    return this.connected
  }

  getStatus() {
    return {
      connected: this.connected,
      messageCount: this.messageCount,
      lastUpdate: this.lastUpdate,
    }
  }
}

export const mqttClient = new MqttClientService()
