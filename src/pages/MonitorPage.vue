<script setup lang="ts">
import { ref, onMounted } from 'vue'
import SideNav from '@/components/SideNav.vue'
import ChannelStatusList from '@/components/ChannelStatusList.vue'
import HistoryChart from '@/components/HistoryChart.vue'
import type { TopologyNode, ChannelStatus, ApiResponse } from '@/types'

const channels = ref<ChannelStatus[]>([])
const nodes = ref<TopologyNode[]>([])
const selectedNodeId = ref<string | null>(null)

onMounted(() => {
  fetch('/api/monitor/channels')
    .then((res) => res.json())
    .then((json: ApiResponse<ChannelStatus[]>) => {
      if (json.success && json.data) {
        channels.value = json.data
      }
    })
    .catch(() => {})

  fetch('/api/topology')
    .then((res) => res.json())
    .then((json: ApiResponse<{ nodes: TopologyNode[] }>) => {
      if (json.success && json.data) {
        nodes.value = json.data.nodes
        if (nodes.value.length > 0) {
          selectedNodeId.value = nodes.value[0].id
        }
      }
    })
    .catch(() => {})
})
</script>

<template>
  <div class="h-screen flex flex-col" style="background-color: #0a1628">
    <div class="flex flex-1 min-h-0">
      <SideNav />

      <div class="flex-1 flex flex-col min-w-0 p-6 overflow-auto">
        <h1 class="text-xl font-semibold text-white mb-6">系统监控</h1>

        <div class="mb-6">
          <h2 class="text-sm text-gray-400 mb-3">通道状态</h2>
          <ChannelStatusList :channels="channels" />
        </div>

        <div class="flex-1 min-h-[350px]">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm text-gray-400">历史数据</h2>
            <select
              v-model="selectedNodeId"
              class="text-sm rounded px-3 py-1.5 outline-none"
              style="background-color: #0d1f3c; border: 1px solid #1a3a5c; color: #e2e8f0"
            >
              <option v-for="node in nodes" :key="node.id" :value="node.id">
                {{ node.name }}
              </option>
            </select>
          </div>
          <div class="h-[350px] rounded-lg" style="background-color: #0d1f3c; border: 1px solid #1a3a5c">
            <HistoryChart :node-id="selectedNodeId" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
