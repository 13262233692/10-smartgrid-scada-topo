import { ref, onUnmounted } from 'vue'
import type { TelemetryMetrics, TelemetryUpdate, ApiResponse } from '@/types'

export function useTelemetry() {
  const telemetry = ref<Map<string, TelemetryMetrics>>(new Map())
  const isConnected = ref(false)
  let eventSource: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let retryDelay = 1000

  function fetchLatest() {
    fetch('/api/telemetry/latest')
      .then((res) => res.json())
      .then((json: ApiResponse<Record<string, TelemetryUpdate>>) => {
        if (json.success && json.data) {
          const newMap = new Map<string, TelemetryMetrics>()
          for (const [nodeId, update] of Object.entries(json.data)) {
            newMap.set(nodeId, update.metrics)
          }
          telemetry.value = newMap
        }
      })
      .catch(() => {})
  }

  function connect() {
    if (eventSource) {
      eventSource.close()
    }

    eventSource = new EventSource('/api/telemetry/stream')

    eventSource.onopen = () => {
      isConnected.value = true
      retryDelay = 1000
    }

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        if (parsed.type === 'telemetry' && parsed.update) {
          const update: TelemetryUpdate = parsed.update
          const newMap = new Map(telemetry.value)
          newMap.set(update.nodeId, update.metrics)
          telemetry.value = newMap
        }
      } catch {
        // ignore parse errors
      }
    }

    eventSource.onerror = () => {
      isConnected.value = false
      eventSource?.close()
      eventSource = null
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      retryDelay = Math.min(retryDelay * 2, 30000)
      connect()
    }, retryDelay)
  }

  function reconnect() {
    retryDelay = 1000
    connect()
  }

  fetchLatest()
  connect()

  onUnmounted(() => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    eventSource?.close()
    eventSource = null
  })

  return { telemetry, isConnected, reconnect }
}
