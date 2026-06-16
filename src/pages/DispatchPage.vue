<script setup lang="ts">
import { ref, computed } from 'vue'
import { Wifi, WifiOff, Clock } from 'lucide-vue-next'
import SideNav from '@/components/SideNav.vue'
import TopologyCanvas from '@/components/TopologyCanvas.vue'
import DevicePanel from '@/components/DevicePanel.vue'
import AlarmBar from '@/components/AlarmBar.vue'
import { useTopology } from '@/composables/useTopology'
import { useTelemetry } from '@/composables/useTelemetry'
import { usePowerFlow } from '@/composables/usePowerFlow'
import { useAlarms } from '@/composables/useAlarms'
import type { TopologyNode } from '@/types'

const { topology, loading, error } = useTopology()
const { telemetry, isConnected } = useTelemetry()
const { powerFlow } = usePowerFlow()
const { alarms } = useAlarms()

const selectedNodeId = ref<string | null>(null)

const selectedNode = computed<TopologyNode | null>(() => {
  if (!selectedNodeId.value || !topology.value) return null
  return topology.value.nodes.find((n) => n.id === selectedNodeId.value) || null
})

const selectedTelemetry = computed(() => {
  if (!selectedNodeId.value) return undefined
  return telemetry.value.get(selectedNodeId.value)
})

function onNodeClick(nodeId: string) {
  if (selectedNodeId.value === nodeId) {
    selectedNodeId.value = null
  } else {
    selectedNodeId.value = nodeId
  }
}

function closePanel() {
  selectedNodeId.value = null
}

const currentTime = ref(new Date())
setInterval(() => {
  currentTime.value = new Date()
}, 1000)

const timeStr = computed(() => {
  return currentTime.value.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})

const dateStr = computed(() => {
  return currentTime.value.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
})
</script>

<template>
  <div class="h-screen flex flex-col" style="background-color: #0a1628">
    <div class="flex flex-1 min-h-0">
      <SideNav />

      <div class="flex-1 flex flex-col min-w-0">
        <header
          class="h-12 flex items-center justify-between px-4 shrink-0"
          style="background-color: #0d1f3c; border-bottom: 1px solid #1a3a5c"
        >
          <div class="flex items-center gap-3">
            <h1 class="text-sm font-semibold text-scada-blue">
              {{ topology?.substationName || '加载中...' }}
            </h1>
            <span v-if="topology" class="text-xs text-gray-400 px-2 py-0.5 rounded" style="background-color: #1a3a5c">
              {{ topology.voltageLevel }}
            </span>
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-1.5 text-xs">
              <Clock :size="14" class="text-gray-400" />
              <span class="text-gray-300 font-mono">{{ dateStr }} {{ timeStr }}</span>
            </div>
            <div class="flex items-center gap-1.5 text-xs">
              <component
                :is="isConnected ? Wifi : WifiOff"
                :size="14"
                :class="isConnected ? 'text-scada-green' : 'text-scada-red'"
              />
              <span :class="isConnected ? 'text-scada-green' : 'text-scada-red'">
                {{ isConnected ? '已连接' : '断开' }}
              </span>
            </div>
          </div>
        </header>

        <div class="flex-1 relative min-h-0">
          <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
            <div class="text-gray-400 text-sm">加载拓扑数据中...</div>
          </div>
          <div v-else-if="error" class="absolute inset-0 flex items-center justify-center">
            <div class="text-scada-red text-sm">{{ error }}</div>
          </div>
          <TopologyCanvas
            v-else-if="topology"
            :topology="topology"
            :telemetry="telemetry"
            :power-flow="powerFlow"
            @node-click="onNodeClick"
          />
        </div>

        <AlarmBar :alarms="alarms" />
      </div>

      <DevicePanel
        :node="selectedNode"
        :telemetry="selectedTelemetry"
        @close="closePanel"
      />
    </div>
  </div>
</template>
