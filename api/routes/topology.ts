import { Router, type Request, type Response } from 'express'
import { topologyData } from '../data/topology.js'

const router = Router()

router.get('/', (req: Request, res: Response): void => {
  res.json({
    success: true,
    data: topologyData,
  })
})

export default router
