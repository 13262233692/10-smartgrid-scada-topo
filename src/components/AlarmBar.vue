<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { AlertTriangle, Info, AlertCircle } from 'lucide-vue-next'
import type { AlarmRecord } from '@/types'

const props = defineProps<{
  alarms: AlarmRecord[]
}>()

const scrollContainer = ref<HTMLDivElement | null>(null)

watch(() => props.alarms, () => {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollLeft = 0
    }
  })
}, { deep: true })

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function levelIcon(level: AlarmRecord['level']) {
  if (level === 'critical') return AlertCircle
  if (level === 'warning') return AlertTriangle
  return Info
}

function levelColor(level: AlarmRecord['level']): string {
  if (level === 'critical') return '#ef4444'
  if (level === 'warning') return '#ff6b35'
  return '#00b4d8'
}
</script>

<template>
  <div
    class="h-12 flex items-center px-3 gap-3 z-30"
    style="background-color: rgba(10, 22, 40, 0.9); border-top: 1px solid #1a3a5c"
  >
    <div class="shrink-0 flex items-center gap-1.5">
      <AlertCircle :size="16" class="text-scada-orange" />
      <span class="text-xs text-gray-400">告警</span>
      <span class="text-xs text-scada-orange font-mono">{{ alarms.length }}</span>
    </div>
    <div
      ref="scrollContainer"
      class="flex-1 flex items-center gap-4 overflow-x-auto alarm-scroll"
    >
      <div
        v-for="alarm in alarms"
        :key="alarm.id"
        class="flex items-center gap-2 shrink-0"
      >
        <span class="text-xs text-gray-500 font-mono">{{ formatTime(alarm.timestamp) }}</span>
        <component
          :is="levelIcon(alarm.level)"
          :size="12"
          :style="{ color: levelColor(alarm.level) }"
        />
        <span
          class="text-xs whitespace-nowrap"
          :style="{ color: levelColor(alarm.level) }"
        >
          {{ alarm.nodeName }}
        </span>
        <span class="text-xs text-gray-300 whitespace-nowrap">{{ alarm.message }}</span>
      </div>
      <div v-if="alarms.length === 0" class="text-xs text-gray-500">暂无告警</div>
    </div>
  </div>
</template>

<style scoped>
.alarm-scroll::-webkit-scrollbar {
  height: 4px;
}
.alarm-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.alarm-scroll::-webkit-scrollbar-thumb {
  background: #1a3a5c;
  border-radius: 2px;
}
</style>
