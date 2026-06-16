import express, { type Request, type Response } from 'express'
import { iec104Simulator } from '../services/iec104Simulator.js'
import { telemetryService } from '../services/telemetryService.js'
import { redisService } from '../services/redisService.js'

const router = express.Router()

router.get('/stats', async (req: Request, res: Response) => {
  const stats = telemetryService.getStats()
  const statusStats = telemetryService.getStatusStats()
  const iecStatus = iec104Simulator.getStatus()
  const consumerName = telemetryService.getConsumerName()
  const fallbackMode = redisService.getIsUsingFallback()

  const telemetryInfo = await redisService.streamInfo('stream:telemetry')
  const statusInfo = await redisService.streamInfo('stream:status')
  const alarmsInfo = await redisService.streamInfo('stream:alarms')
  const deadLetterInfo = await redisService.streamInfo('stream:dead-letter')

  const telemetryPending = await redisService.streamXPending(
    'stream:telemetry',
    'telemetry-processor-group'
  )
  const statusPending = await redisService.streamXPending(
    'stream:status',
    'status-monitor-group'
  )

  res.json({
    success: true,
    data: {
      consumerName,
      fallbackMode,
      telemetry: {
        ...stats,
        ...telemetryInfo,
        pending: telemetryPending?.pending ?? 0,
      },
      statusChanges: {
        ...statusStats,
        ...statusInfo,
        pending: statusPending?.pending ?? 0,
      },
      alarms: alarmsInfo,
      deadLetter: deadLetterInfo,
      iec104: iecStatus,
    },
  })
})

router.post('/trigger-trip', async (req: Request, res: Response) => {
  const { breakerId, reason } = req.body
  try {
    const streamId = await iec104Simulator.triggerBreakerTrip(
      breakerId || 'brk-bustie',
      reason
    )
    res.json({
      success: true,
      data: { streamId, breakerId: breakerId || 'brk-bustie' },
    })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

router.post('/trigger-close', async (req: Request, res: Response) => {
  const { breakerId, reason } = req.body
  try {
    const streamId = await iec104Simulator.triggerBreakerClose(
      breakerId || 'brk-bustie',
      reason
    )
    res.json({
      success: true,
      data: { streamId, breakerId: breakerId || 'brk-bustie' },
    })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

router.post('/high-load', (req: Request, res: Response) => {
  const { duration } = req.body
  iec104Simulator.enableHighLoadMode(duration || 30000)
  res.json({
    success: true,
    data: { enabled: true, duration: duration || 30000 },
  })
})

router.post('/batch-test', async (req: Request, res: Response) => {
  const { count = 100, type = 'telemetry' } = req.body
  const results: { streamId: string; nodeId: string }[] = []

  for (let i = 0; i < count; i++) {
    const nodeId = `test-node-${type}-${i}`
    const streamId = await redisService.streamAdd(`stream:${type}`, {
      type,
      nodeId,
      value: String(Math.random() * 1000),
      timestamp: String(Date.now()),
      quality: 'good',
      test: 'true',
    })
    results.push({ streamId, nodeId })
  }

  res.json({
    success: true,
    data: {
      count: results.length,
      first: results[0],
      last: results[results.length - 1],
    },
  })
})

router.get('/pending/:stream', async (req: Request, res: Response) => {
  const { stream } = req.params
  const streamKey = `stream:${stream}`
  const groupMap: Record<string, string> = {
    telemetry: 'telemetry-processor-group',
    status: 'status-monitor-group',
    alarms: 'alarm-dispatcher-group',
  }
  const groupName = groupMap[stream] || `${stream}-group`

  const info = await redisService.streamInfo(streamKey)
  const pending = await redisService.streamXPending(streamKey, groupName)

  res.json({
    success: true,
    data: { streamKey, groupName, info, pending },
  })
})

router.get('/consume-burst/:stream', async (req: Request, res: Response) => {
  const { stream } = req.params
  const { count = 20, group, consumer } = req.query as { count?: string; group?: string; consumer?: string }

  const streamKey = `stream:${stream}`
  const groupMap: Record<string, string> = {
    telemetry: 'telemetry-processor-group',
    status: 'status-monitor-group',
    alarms: 'alarm-dispatcher-group',
  }
  const groupName = group || groupMap[stream] || `${stream}-group`
  const consumerName = consumer || `test-consumer-${Date.now()}`

  const messages = await redisService.streamReadGroup(
    streamKey,
    groupName,
    consumerName,
    Number(count) || 20,
    '>'
  )

  const ackIds = messages.map((m) => m.id)
  const acked = ackIds.length
    ? await redisService.streamAck(streamKey, groupName, ...ackIds)
    : 0

  res.json({
    success: true,
    data: {
      streamKey,
      groupName,
      consumerName,
      received: messages.length,
      acked,
      sample: messages.slice(0, 3),
    },
  })
})

router.post('/simulate-flash-crash', async (req: Request, res: Response) => {
  const { crashMs = 500, tripBreaker = 'brk-bustie' } = req.body as { crashMs?: number; tripBreaker?: string }

  const beforeTripId = await iec104Simulator.triggerBreakerTrip(tripBreaker, '闪断前测试跳闸')

  await new Promise((r) => setTimeout(r, 100))

  const pendingBefore = await redisService.streamXPending(
    'stream:status',
    'status-monitor-group'
  )

  const duringTripPromise = new Promise<void>((resolve) => {
    setTimeout(async () => {
      await iec104Simulator.triggerBreakerTrip(tripBreaker, '闪断期间跳闸')
      resolve()
    }, crashMs / 2)
  })

  await duringTripPromise

  await new Promise((r) => setTimeout(r, crashMs))

  const pendingAfter = await redisService.streamXPending(
    'stream:status',
    'status-monitor-group'
  )

  const statusChanges = telemetryService.getStatusChanges()

  res.json({
    success: true,
    data: {
      crashMs,
      tripBreaker,
      beforeTripId,
      pendingBefore: pendingBefore?.pending ?? 0,
      pendingAfter: pendingAfter?.pending ?? 0,
      recentStatusChanges: statusChanges.slice(0, 5),
      statusChangeCount: statusChanges.length,
      note: 'Streams 模式下，闪断期间的跳闸消息会保留在 Stream 中，重连后消费组可追溯，不会丢失（At-Least-Once）',
    },
  })
})

export default router
