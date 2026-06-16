import mqtt from 'mqtt'
import { redisService } from './redisService.js'

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
        this.client!.subscribe('scada/telemetry/#', (err) => {
          if (err) {
            console.warn('[MQTT] Subscribe failed:', err.message)
          } else {
            console.log('[MQTT] Subscribed to scada/telemetry/#')
          }
        })
      })

      this.client.on('message', (topic, payload) => {
        this.messageCount++
        this.lastUpdate = Date.now()
        const message = payload.toString()
        redisService.publish('scada:telemetry', JSON.stringify({
          topic,
          message,
          timestamp: Date.now(),
        }))
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

  async publish(topic: string, message: string): Promise<void> {
    if (!this.client || !this.connected) {
      return
    }
    try {
      this.client.publish(topic, message)
    } catch (err: any) {
      console.warn('[MQTT] Publish failed:', err.message)
    }
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
