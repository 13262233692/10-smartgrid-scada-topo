import { ref } from 'vue'
import type { TopologyData, ApiResponse } from '@/types'

export function useTopology() {
  const topology = ref<TopologyData | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  fetch('/api/topology')
    .then((res) => res.json())
    .then((json: ApiResponse<TopologyData>) => {
      if (json.success && json.data) {
        topology.value = json.data
      } else {
        error.value = 'Failed to load topology data'
      }
    })
    .catch((err) => {
      error.value = err.message || 'Network error'
    })
    .finally(() => {
      loading.value = false
    })

  return { topology, loading, error }
}
