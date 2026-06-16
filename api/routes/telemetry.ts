import { Router, type Request, type Response } from 'express'
import { telemetryService } from '../services/telemetryService.js'

const router = Router()

router.get('/latest', (req: Request, res: Response): void => {
  const latest = telemetryService.getLatest()
  const result: Record<string, any> = {}
  for (const [nodeId, update] of latest) {
    result[nodeId] = update
  }
  res.json({
    success: true,
    data: result,
  })
})

router.get('/stream', (req: Request, res: Response): void => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)

  telemetryService.addSSEConnection(res)

  req.on('close', () => {
    res.end()
  })
})

router.get('/history/:nodeId', (req: Request, res: Response): void => {
  const nodeId = req.params.nodeId
  if (!nodeId) {
    res.status(400).json({ success: false, error: 'nodeId is required' })
    return
  }

  const history = telemetryService.getHistory(nodeId)
  res.json({
    success: true,
    data: history,
  })
})

export default router
