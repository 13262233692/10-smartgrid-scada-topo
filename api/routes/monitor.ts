import { Router, type Request, type Response } from 'express'
import type { ChannelStatus } from '../types/index.js'
import { redisService } from '../services/redisService.js'
import { mqttClient } from '../services/mqttClient.js'
import { iec104Simulator } from '../services/iec104Simulator.js'

const router = Router()

router.get('/channels', (req: Request, res: Response): void => {
  const mqttStatus = mqttClient.getStatus()
  const iec104Status = iec104Simulator.getStatus()

  const channels: ChannelStatus[] = [
    {
      id: 'ch-iec104-1',
      name: 'IEC 104 通道1',
      type: 'iec104',
      status: iec104Status.running ? 'online' : 'offline',
      lastUpdate: iec104Status.lastUpdate,
      messageCount: iec104Status.messageCount,
    },
    {
      id: 'ch-mqtt-1',
      name: 'MQTT 数据通道',
      type: 'mqtt',
      status: mqttStatus.connected ? 'online' : (mqttStatus.messageCount > 0 ? 'degraded' : 'offline'),
      lastUpdate: mqttStatus.lastUpdate,
      messageCount: mqttStatus.messageCount,
    },
    {
      id: 'ch-redis-1',
      name: 'Redis 缓存通道',
      type: 'mqtt',
      status: redisService.getIsUsingFallback() ? 'degraded' : 'online',
      lastUpdate: Date.now(),
      messageCount: 0,
    },
  ]

  res.json({
    success: true,
    data: channels,
  })
})

export default router
