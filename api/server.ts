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

  const interval = setInterval(() => {
    const connections = telemetryService.getSSEConnections().size
    if (connections > 0) {
      console.log(`[Server] Active SSE connections: ${connections}`)
    }
  }, 30000)

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received')
    clearInterval(interval)
    iec104Simulator.stop()
    server.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  })

  process.on('SIGINT', () => {
    console.log('SIGINT signal received')
    clearInterval(interval)
    iec104Simulator.stop()
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
