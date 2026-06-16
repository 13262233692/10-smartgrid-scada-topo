import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.js'
import topologyRoutes from './routes/topology.js'
import telemetryRoutes from './routes/telemetry.js'
import powerFlowRoutes from './routes/powerFlow.js'
import monitorRoutes from './routes/monitor.js'
import alarmsRoutes from './routes/alarms.js'
import streamTestRoutes from './routes/streamTest.js'
import uflsRoutes from './routes/ufls.js'
import { redisService } from './services/redisService.js'
import { mqttClient } from './services/mqttClient.js'
import { iec104Simulator } from './services/iec104Simulator.js'
import { telemetryService } from './services/telemetryService.js'

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/topology', topologyRoutes)
app.use('/api/telemetry', telemetryRoutes)
app.use('/api/power-flow', powerFlowRoutes)
app.use('/api/monitor', monitorRoutes)
app.use('/api/alarms', alarmsRoutes)
app.use('/api/stream-test', streamTestRoutes)
app.use('/api/ufls', uflsRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export async function initializeServices(): Promise<void> {
  console.log('[App] Initializing services...')

  await redisService.connect()
  console.log('[App] Redis service initialized' + (redisService.getIsUsingFallback() ? ' (fallback mode)' : ''))

  await telemetryService.start()
  console.log('[App] Telemetry stream consumer started')

  await mqttClient.connect()
  console.log('[App] MQTT client initialized' + (mqttClient.isConnected() ? '' : ' (unavailable)'))

  console.log('[App] All services initialized')
}

export { telemetryService, iec104Simulator, redisService, mqttClient }

export default app
