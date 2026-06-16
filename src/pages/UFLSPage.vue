<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import UFLSTopologyCanvas from '@/components/UFLSTopologyCanvas.vue'
import type {
  TopologyData,
  TelemetryMetrics,
  UFLSSimulationState,
  UFLSConfig,
  ShedRound,
  LoadPriority,
} from '@/types'

const topology = ref<TopologyData | null>(null)
const telemetry = ref<Map<string, TelemetryMetrics>>(new Map())
const uflsState = ref<UFLSSimulationState | null>(null)
const config = ref<UFLSConfig | null>(null)
const selectedFaultNode = ref<string>('')
const loading = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const statusLabel = computed(() => {
  switch (uflsState.value?.status) {
    case 'idle': return '待机'
    case 'running': return '仿真中'
    case 'stabilized': return '已稳定'
    case 'blackout': return '全黑停电'
    default: return '待机'
  }
})

const statusColor = computed(() => {
  switch (uflsState.value?.status) {
    case 'idle': return 'text-gray-400'
    case 'running': return 'text-yellow-400'
    case 'stabilized': return 'text-green-400'
    case 'blackout': return 'text-red-500'
    default: return 'text-gray-400'
  }
})

const shedRoundsDesc = computed(() => {
  return [...(uflsState.value?.shedRounds || [])].reverse()
})

const eventLogDesc = computed(() => {
  return uflsState.value?.eventLog || []
})

const loadPriorityMap = computed(() => {
  return config.value?.loadPriorityMap || {}
})

async function loadTopology() {
  try {
    const res = await fetch('/api/topology')
    const data = await res.json()
    if (data.success) {
      topology.value = data.data
    }
  } catch (e) {
    console.error('Failed to load topology:', e)
  }
}

async function loadConfig() {
  try {
    const res = await fetch('/api/ufls/config')
    const data = await res.json()
    if (data.success) {
      config.value = data.data
      if (data.data.faultNodes?.length > 0) {
        selectedFaultNode.value = data.data.faultNodes[0].id
      }
    }
  } catch (e) {
    console.error('Failed to load UFLS config:', e)
  }
}

async function refreshState() {
  try {
    const res = await fetch('/api/ufls/state')
    const data = await res.json()
    if (data.success) {
      uflsState.value = data.data
    }
  } catch (e) {
    console.error('Failed to refresh state:', e)
  }
}

async function triggerFault() {
  if (!selectedFaultNode.value) return
  loading.value = true
  try {
    const res = await fetch('/api/ufls/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: selectedFaultNode.value }),
    })
    const data = await res.json()
    if (data.success) {
      uflsState.value = data.data
    }
  } catch (e) {
    console.error('Failed to trigger fault:', e)
  }
  loading.value = false
}

async function startSimulation() {
  try {
    const res = await fetch('/api/ufls/start', { method: 'POST' })
    const data = await res.json()
    if (data.success) {
      uflsState.value = data.data
      startPolling()
    }
  } catch (e) {
    console.error('Failed to start simulation:', e)
  }
}

async function stopSimulation() {
  try {
    const res = await fetch('/api/ufls/stop', { method: 'POST' })
    const data = await res.json()
    if (data.success) {
      uflsState.value = data.data
      stopPolling()
    }
  } catch (e) {
    console.error('Failed to stop simulation:', e)
  }
}

async function resetSimulation() {
  stopPolling()
  try {
    const res = await fetch('/api/ufls/reset', { method: 'POST' })
    const data = await res.json()
    if (data.success) {
      uflsState.value = data.data
    }
  } catch (e) {
    console.error('Failed to reset simulation:', e)
  }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(refreshState, 500)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function handleNodeClick(nodeId: string) {
  const node = topology.value?.nodes.find(n => n.id === nodeId)
  if (node && (node.type === 'line' || node.type === 'generator' || node.type === 'breaker')) {
    selectedFaultNode.value = nodeId
  }
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'critical': return 'text-red-400'
    case 'warning': return 'text-yellow-400'
    case 'info': return 'text-blue-400'
    default: return 'text-gray-400'
  }
}

function getPriorityLabel(priority: LoadPriority): string {
  const map: Record<LoadPriority, string> = {
    interruptible: '可中断',
    ordinary: '普通',
    important: '重要',
    critical: '特级',
  }
  return map[priority] || priority
}

function getPriorityColor(priority: LoadPriority): string {
  const map: Record<LoadPriority, string> = {
    interruptible: 'bg-amber-600',
    ordinary: 'bg-gray-600',
    important: 'bg-blue-600',
    critical: 'bg-green-600',
  }
  return map[priority] || 'bg-gray-600'
}

watch(
  () => uflsState.value?.status,
  (status) => {
    if (status === 'stabilized' || status === 'blackout') {
      stopPolling()
    }
  }
)

onMounted(async () => {
  await loadTopology()
  await loadConfig()
  await refreshState()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="h-full flex flex-col bg-[#061425]">
    <div class="px-5 py-3 border-b border-scada-border/50 flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold text-scada-blue">低频减载仿真 (UFLS)</h2>
        <p class="text-xs text-gray-500">模拟电网故障后的级联切负荷过程</p>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full animate-pulse" :class="statusColor.replace('text-', 'bg-')"></span>
          <span :class="statusColor" class="text-sm font-medium">{{ statusLabel }}</span>
        </div>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <div class="w-72 border-r border-scada-border/30 p-4 flex flex-col gap-4 overflow-y-auto">
        <div class="space-y-3">
          <h3 class="text-sm font-bold text-gray-300 border-l-2 border-scada-blue pl-2">故障设置</h3>

          <div>
            <label class="text-xs text-gray-400 mb-1 block">选择故障节点</label>
            <select
              v-model="selectedFaultNode"
              class="w-full bg-[#0d1f3c] border border-scada-border/50 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-scada-blue"
            >
              <option v-for="node in config?.faultNodes" :key="node.id" :value="node.id">
                {{ node.name }} ({{ node.type }})
              </option>
            </select>
            <p class="text-xs text-gray-500 mt-1">也可点击拓扑图上的设备选择</p>
          </div>

          <div class="flex gap-2">
            <button
              @click="triggerFault"
              :disabled="!selectedFaultNode || loading || uflsState?.status !== 'idle'"
              class="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm py-2 rounded transition-colors font-medium"
            >
              {{ loading ? '...' : '触发故障' }}
            </button>
          </div>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-bold text-gray-300 border-l-2 border-scada-blue pl-2">仿真控制</h3>

          <div class="grid grid-cols-2 gap-2">
            <button
              @click="startSimulation"
              :disabled="uflsState?.status === 'idle' || uflsState?.running"
              class="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm py-2 rounded transition-colors"
            >
              开始
            </button>
            <button
              @click="stopSimulation"
              :disabled="!uflsState?.running"
              class="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm py-2 rounded transition-colors"
            >
              暂停
            </button>
          </div>

          <button
            @click="resetSimulation"
            class="w-full bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded transition-colors"
          >
            重置仿真
          </button>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-bold text-gray-300 border-l-2 border-scada-blue pl-2">负荷等级</h3>
          <div class="space-y-2">
            <div
              v-for="(info, key) in config?.loadClasses"
              :key="key"
              class="flex items-center gap-2 text-xs"
            >
              <div class="w-3 h-3 rounded-sm" :class="getPriorityColor(key as LoadPriority)"></div>
              <span class="text-gray-300">{{ info.name }}</span>
              <span class="text-gray-500 ml-auto">{{ info.shedOrder }}级</span>
            </div>
          </div>
          <p class="text-xs text-gray-500">
            按重要程度从低到高依次切除，特级负荷最后保留
          </p>
        </div>

        <div class="space-y-3">
          <h3 class="text-sm font-bold text-gray-300 border-l-2 border-scada-blue pl-2">频率保护参数</h3>
          <div class="text-xs space-y-1 text-gray-400">
            <div class="flex justify-between">
              <span>额定频率</span>
              <span class="text-gray-300">{{ config?.params.NOMINAL_FREQUENCY }} Hz</span>
            </div>
            <div class="flex justify-between">
              <span>首轮动作</span>
              <span class="text-yellow-400">{{ config?.params.FIRST_STAGE_FREQ }} Hz</span>
            </div>
            <div class="flex justify-between">
              <span>末轮动作</span>
              <span class="text-red-500">{{ config?.params.LAST_STAGE_FREQ }} Hz</span>
            </div>
            <div class="flex justify-between">
              <span>级差</span>
              <span class="text-gray-300">{{ config?.params.FREQ_RELAY_STEP }} Hz</span>
            </div>
          </div>
        </div>
      </div>

      <div class="flex-1 p-4 flex flex-col">
        <div class="flex-1 relative">
          <UFLSTopologyCanvas
            :topology="topology"
            :telemetry="telemetry"
            :ufls-state="uflsState"
            :load-priority-map="loadPriorityMap"
            @node-click="handleNodeClick"
          />
        </div>
      </div>

      <div class="w-80 border-l border-scada-border/30 p-4 flex flex-col gap-4 overflow-y-auto">
        <div class="space-y-2">
          <h3 class="text-sm font-bold text-gray-300 border-l-2 border-scada-blue pl-2">实时频率</h3>
          <div
            class="text-center py-4 rounded-lg bg-[#0d1f3c]/50 border border-scada-border/30"
          >
            <div
              class="text-4xl font-bold font-mono"
              :class="{
                'text-green-400': !uflsState || uflsState.currentFrequency >= 49.5,
                'text-yellow-400': uflsState && uflsState.currentFrequency >= 48 && uflsState.currentFrequency < 49.5,
                'text-red-500': uflsState && uflsState.currentFrequency < 48,
              }"
            >
              {{ uflsState?.currentFrequency?.toFixed(2) || '50.00' }}
            </div>
            <div class="text-xs text-gray-500 mt-1">Hz</div>
          </div>
        </div>

        <div class="space-y-2">
          <h3 class="text-sm font-bold text-gray-300 border-l-2 border-scada-blue pl-2">
            减载轮次 <span class="text-xs text-gray-500 font-normal">({{ uflsState?.shedRounds?.length || 0 }}轮)</span>
          </h3>
          <div class="space-y-2 max-h-64 overflow-y-auto">
            <div
              v-for="round in shedRoundsDesc"
              :key="round.round"
              class="bg-[#0d1f3c]/50 border border-scada-border/30 rounded p-2 text-xs"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="font-medium text-gray-300">第 {{ round.round }} 轮</span>
                <span class="px-2 py-0.5 rounded text-white text-[10px]" :class="getPriorityColor(round.shedLoadClass)">
                  {{ getPriorityLabel(round.shedLoadClass) }}
                </span>
              </div>
              <div class="text-gray-500 text-[11px] space-y-0.5">
                <div>触发频率: <span class="text-yellow-400">{{ round.actualFrequency.toFixed(2) }} Hz</span></div>
                <div>功率缺额: {{ round.deficitMW.toFixed(0) }} MW</div>
                <div>切除负荷: <span class="text-orange-400">{{ round.sheddedLoadMW.toFixed(0) }} MW</span></div>
                <div>设备数: {{ round.shedLoadIds.length }} 个</div>
              </div>
            </div>
            <div v-if="!shedRoundsDesc.length" class="text-center text-gray-500 text-xs py-4">
              暂无减载记录
            </div>
          </div>
        </div>

        <div class="space-y-2 flex-1 min-h-0 flex flex-col">
          <h3 class="text-sm font-bold text-gray-300 border-l-2 border-scada-blue pl-2 shrink-0">事件日志</h3>
          <div class="flex-1 overflow-y-auto space-y-1 text-xs">
            <div
              v-for="(event, idx) in eventLogDesc"
              :key="idx"
              class="flex gap-2 py-1 border-b border-scada-border/20"
            >
              <span :class="getLevelColor(event.level)" class="shrink-0 w-12">
                [{{ event.level === 'critical' ? '严重' : event.level === 'warning' ? '警告' : '信息' }}]
              </span>
              <span class="text-gray-400">{{ event.message }}</span>
            </div>
            <div v-if="!eventLogDesc.length" class="text-center text-gray-500 py-4">
              暂无事件
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
