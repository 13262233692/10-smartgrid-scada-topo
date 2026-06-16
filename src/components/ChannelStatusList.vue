<script setup lang="ts">
import type { ChannelStatus } from '@/types'
import { Wifi, WifiOff } from 'lucide-vue-next'

defineProps<{
  channels: ChannelStatus[]
}>()

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function statusColor(status: ChannelStatus['status']): string {
  if (status === 'online') return '#22c55e'
  if (status === 'degraded') return '#ff6b35'
  return '#ef4444'
}

function statusLabel(status: ChannelStatus['status']): string {
  if (status === 'online') return '在线'
  if (status === 'degraded') return '降级'
  return '离线'
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="ch in channels"
      :key="ch.id"
      class="flex items-center justify-between px-4 py-3 rounded-lg"
      style="background-color: #0d1f3c; border: 1px solid #1a3a5c"
    >
      <div class="flex items-center gap-3">
        <component
          :is="ch.status === 'offline' ? WifiOff : Wifi"
          :size="18"
          :style="{ color: statusColor(ch.status) }"
        />
        <div>
          <div class="text-sm text-white">{{ ch.name }}</div>
          <div class="text-xs text-gray-400 mt-0.5">
            {{ ch.type.toUpperCase() }} · 消息数 {{ ch.messageCount.toLocaleString() }}
          </div>
        </div>
      </div>
      <div class="text-right">
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: statusColor(ch.status) }" />
          <span class="text-xs" :style="{ color: statusColor(ch.status) }">{{ statusLabel(ch.status) }}</span>
        </div>
        <div class="text-xs text-gray-500 mt-0.5">{{ formatTime(ch.lastUpdate) }}</div>
      </div>
    </div>
  </div>
</template>
