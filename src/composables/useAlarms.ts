import { ref, computed, onUnmounted } from 'vue'
import type { AlarmRecord, ApiResponse } from '@/types'

export function useAlarms(interval = 2000) {
  const alarms = ref<AlarmRecord[]>([])

  const unacknowledgedCount = computed(() => {
    return alarms.value.filter((a) => !a.acknowledged).length
  })

  function fetchAlarms() {
    fetch('/api/alarms')
      .then((res) => res.json())
      .then((json: ApiResponse<AlarmRecord[]>) => {
        if (json.success && json.data) {
          alarms.value = json.data
        }
      })
      .catch(() => {})
  }

  fetchAlarms()
  const timer = setInterval(fetchAlarms, interval)

  onUnmounted(() => {
    clearInterval(timer)
  })

  return { alarms, unacknowledgedCount }
}
