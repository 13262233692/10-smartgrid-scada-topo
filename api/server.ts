import app, { initializeServices } from './app.js'
import { iec104Simulator } from './services/iec104Simulator.js'
import { telemetryService } from './services/telemetryService.js'

const PORT = process.env.PORT || 3001

async function start(): Promise<void> {
  await initializeServices()

  const server = app.listen(PORT, () => {
    console.log(`Server ready on port ${PORT}`)
  })

  iec104Simulator.start()
  console.log('[Server] IEC104 simulator started')

  const statsInterval = setInterval(() => {
    const connections = telemetryService.getSSEConnections().size
    const stats = telemetryService.getStats()
    if (connections > 0 || stats.processed > 0) {
      console.log(
        `[Server] SSE: ${connections} | Streams: processed=${stats.processed}, acked=${stats.acked}, retries=${stats.retries}, dead=${stats.deadLettered}`
      )
    }
  }, 30000)

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received')
    clearInterval(statsInterval)
    iec104Simulator.stop()
    telemetryService.stop()
    server.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  })

  process.on('SIGINT', () => {
    console.log('SIGINT signal received')
    clearInterval(statsInterval)
    iec104Simulator.stop()
    telemetryService.stop()
    server.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})

export default app
