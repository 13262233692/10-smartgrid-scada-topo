import { Router, type Request, type Response } from 'express'
import { topologyData } from '../data/topology.js'
import { telemetryService } from '../services/telemetryService.js'
import { calculatePowerFlow } from '../services/powerFlowCalculator.js'

const router = Router()

router.get('/', (req: Request, res: Response): void => {
  const latest = telemetryService.getLatest()
  const telemetryMap = new Map<string, any>()
  for (const [nodeId, update] of latest) {
    telemetryMap.set(nodeId, update.metrics)
  }

  const results = calculatePowerFlow(topologyData, telemetryMap)

  res.json({
    success: true,
    data: results,
  })
})

export default router
