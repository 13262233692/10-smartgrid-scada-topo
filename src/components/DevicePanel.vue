<script setup lang="ts">
import { computed } from 'vue'
import { X, Zap, Gauge, ThermometerSun, Activity } from 'lucide-vue-next'
import type { TopologyNode, TelemetryMetrics } from '@/types'

const props = defineProps<{
  node: TopologyNode | null
  telemetry: TelemetryMetrics | undefined
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const isOpen = computed(() => props.node !== null)

const statusLabel = computed(() => {
  if (!props.node) return ''
  const s = props.node.status
  if (s === 'on') return '运行'
  if (s === 'off') return '停运'
  if (s === 'fault') return '故障'
  return '未知'
})

const statusColor = computed(() => {
  if (!props.node) return '#6b7280'
  const s = props.node.status
  if (s === 'on') return '#22c55e'
  if (s === 'fault') return '#ef4444'
  return '#6b7280'
})

const typeLabel = computed(() => {
  if (!props.node) return ''
  const map: Record<string, string> = {
    busbar: '母线',
    breaker: '断路器',
    transformer: '变压器',
    line: '线路',
    generator: '发电机',
    load: '负荷',
  }
  return map[props.node.type] || props.node.type
})

const metricsItems = computed(() => {
  const m = props.telemetry
  if (!m) return []
  const items: { label: string; value: string; icon: any; color?: string }[] = []
  if (m.voltage != null) {
    items.push({ label: '电压', value: `${m.voltage.toFixed(1)} kV`, icon: Zap, color: '#00b4d8' })
  }
  if (m.current != null) {
    items.push({ label: '电流', value: `${m.current.toFixed(1)} A`, icon: Gauge, color: '#00b4d8' })
  }
  if (m.activePower != null) {
    items.push({ label: '有功功率', value: `${m.activePower.toFixed(1)} MW`, icon: Activity, color: '#00b4d8' })
  }
  if (m.reactivePower != null) {
    items.push({ label: '无功功率', value: `${m.reactivePower.toFixed(1)} MVar`, icon: ThermometerSun, color: '#ff6b35' })
  }
  if (m.frequency != null) {
    items.push({ label: '频率', value: `${m.frequency.toFixed(3)} Hz`, icon: Activity, color: '#22c55e' })
  }
  return items
})

const ratingsItems = computed(() => {
  const r = props.node?.ratings
  if (!r) return []
  const items: { label: string; value: string }[] = []
  if (r.voltage != null) items.push({ label: '额定电压', value: `${r.voltage} kV` })
  if (r.current != null) items.push({ label: '额定电流', value: `${r.current} A` })
  if (r.activePower != null) items.push({ label: '额定功率', value: `${r.activePower} MW` })
  if (r.reactivePower != null) items.push({ label: '额定无功', value: `${r.reactivePower} MVar` })
  return items
})
</script>

<template>
  <Transition name="slide">
    <div
      v-if="isOpen && node"
      class="fixed top-0 right-0 h-full w-80 z-40 flex flex-col shadow-2xl overflow-y-auto"
      style="background-color: #0d1f3c; border-left: 1px solid #1a3a5c"
    >
      <div class="flex items-center justify-between px-4 h-14 border-b border-scada-border shrink-0">
        <h3 class="text-scada-blue font-semibold text-sm truncate">{{ node.name }}</h3>
        <button
          class="text-gray-400 hover:text-white transition-colors p-1"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>
      </div>

      <div class="p-4 space-y-5 flex-1">
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-400">设备类型</span>
            <span class="text-white">{{ typeLabel }}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-400">设备ID</span>
            <span class="text-white font-mono text-xs">{{ node.id }}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-400">运行状态</span>
            <span class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: statusColor }" />
              <span :style="{ color: statusColor }">{{ statusLabel }}</span>
            </span>
          </div>
          <div v-if="node.voltage != null" class="flex items-center justify-between text-sm">
            <span class="text-gray-400">电压等级</span>
            <span class="text-white">{{ node.voltage }} kV</span>
          </div>
        </div>

        <div v-if="metricsItems.length > 0">
          <h4 class="text-gray-400 text-xs uppercase tracking-wider mb-3">实时遥测</h4>
          <div class="space-y-2">
            <div
              v-for="item in metricsItems"
              :key="item.label"
              class="flex items-center justify-between bg-scada-dark/50 rounded-lg px-3 py-2.5"
            >
              <div class="flex items-center gap-2">
                <component :is="item.icon" :size="14" :style="{ color: item.color }" />
                <span class="text-gray-300 text-sm">{{ item.label }}</span>
              </div>
              <span class="font-mono text-sm" :style="{ color: item.color }">{{ item.value }}</span>
            </div>
          </div>
        </div>

        <div v-if="ratingsItems.length > 0">
          <h4 class="text-gray-400 text-xs uppercase tracking-wider mb-3">额定参数</h4>
          <div class="space-y-1.5">
            <div
              v-for="item in ratingsItems"
              :key="item.label"
              class="flex items-center justify-between text-sm"
            >
              <span class="text-gray-400">{{ item.label }}</span>
              <span class="text-white font-mono text-xs">{{ item.value }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
