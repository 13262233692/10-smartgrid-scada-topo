import express, { type Request, type Response } from 'express'
import { uflsSimulator } from '../services/uflsSimulator.js'
import { LOAD_CLASSES, UFLS_PARAMS } from '../types/index.js'

const router = express.Router()

router.get('/state', (req: Request, res: Response) => {
  const state = uflsSimulator.getState()
  const disabled = uflsSimulator.getDisabledNodes()
  const shedLoads = uflsSimulator.getShedLoads()

  res.json({
    success: true,
    data: {
      ...state,
      disabledNodes: disabled,
      shedLoadNodes: shedLoads,
    },
  })
})

router.get('/config', (req: Request, res: Response) => {
  const faultNodes = uflsSimulator.getAvailableFaultNodes()
  const priorityMap = uflsSimulator.getLoadPriorityMap()

  res.json({
    success: true,
    data: {
      faultNodes,
      loadClasses: LOAD_CLASSES,
      loadPriorityMap: priorityMap,
      params: UFLS_PARAMS,
    },
  })
})

router.post('/trigger', (req: Request, res: Response) => {
  const { nodeId } = req.body as { nodeId: string }

  if (!nodeId) {
    res.status(400).json({ success: false, error: 'nodeId is required' })
    return
  }

  try {
    const state = uflsSimulator.triggerFault(nodeId)
    res.json({
      success: true,
      data: {
        ...state,
        disabledNodes: uflsSimulator.getDisabledNodes(),
        shedLoadNodes: uflsSimulator.getShedLoads(),
      },
    })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

router.post('/start', (req: Request, res: Response) => {
  try {
    uflsSimulator.startSimulation()
    const state = uflsSimulator.getState()
    res.json({
      success: true,
      data: {
        ...state,
        disabledNodes: uflsSimulator.getDisabledNodes(),
        shedLoadNodes: uflsSimulator.getShedLoads(),
      },
    })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

router.post('/stop', (req: Request, res: Response) => {
  uflsSimulator.stop()
  const state = uflsSimulator.getState()
  res.json({
    success: true,
    data: {
      ...state,
      disabledNodes: uflsSimulator.getDisabledNodes(),
      shedLoadNodes: uflsSimulator.getShedLoads(),
    },
  })
})

router.post('/reset', (req: Request, res: Response) => {
  uflsSimulator.reset()
  const state = uflsSimulator.getState()
  res.json({
    success: true,
    data: {
      ...state,
      disabledNodes: uflsSimulator.getDisabledNodes(),
      shedLoadNodes: uflsSimulator.getShedLoads(),
    },
  })
})

router.post('/step', (req: Request, res: Response) => {
  try {
    const state = uflsSimulator.getState()
    if (state.status === 'idle') {
      res.status(400).json({ success: false, error: 'No fault triggered' })
      return
    }
    uflsSimulator.startSimulation()
    setTimeout(() => {
      uflsSimulator.stop()
      const currentState = uflsSimulator.getState()
      res.json({
        success: true,
        data: {
          ...currentState,
          disabledNodes: uflsSimulator.getDisabledNodes(),
          shedLoadNodes: uflsSimulator.getShedLoads(),
        },
      })
    }, UFLS_PARAMS.ROUND_DELAY_MS)
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

router.get('/islands', (req: Request, res: Response) => {
  const state = uflsSimulator.getState()
  res.json({
    success: true,
    data: {
      islands: state.islands,
      count: state.islands.length,
    },
  })
})

router.get('/shed-rounds', (req: Request, res: Response) => {
  const state = uflsSimulator.getState()
  res.json({
    success: true,
    data: {
      rounds: state.shedRounds,
      totalRounds: state.shedRounds.length,
      totalSheddedMW: state.totalSheddedMW,
    },
  })
})

export default router
