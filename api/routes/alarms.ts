import { Router, type Request, type Response } from 'express'
import { telemetryService } from '../services/telemetryService.js'

const router = Router()

router.get('/', (req: Request, res: Response): void => {
  const alarms = telemetryService.getAlarms()
  res.json({
    success: true,
    data: alarms,
  })
})

export default router
