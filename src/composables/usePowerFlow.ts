import { ref, onUnmounted } from 'vue'
import type { PowerFlowResult, ApiResponse } from '@/types'

export function usePowerFlow(interval = 3000) {
  const powerFlow = ref<PowerFlowResult[]>([])
  const loading = ref(true)

  function fetchPowerFlow() {
    fetch('/api/power-flow')
      .then((res) => res.json())
      .then((json: ApiResponse<PowerFlowResult[]>) => {
        if (json.success && json.data) {
          powerFlow.value = json.data
        }
      })
      .catch(() => {})
      .finally(() => {
        loading.value = false
      })
  }

  fetchPowerFlow()
  const timer = setInterval(fetchPowerFlow, interval)

  onUnmounted(() => {
    clearInterval(timer)
  })

  return { powerFlow, loading }
}
