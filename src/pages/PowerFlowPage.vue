<script setup lang="ts">
import { computed } from 'vue'
import SideNav from '@/components/SideNav.vue'
import PowerFlowChart from '@/components/PowerFlowChart.vue'
import { usePowerFlow } from '@/composables/usePowerFlow'
import { Zap, TrendingUp, AlertTriangle } from 'lucide-vue-next'

const { powerFlow, loading } = usePowerFlow()

const totalActive = computed(() => {
  return powerFlow.value.reduce((sum, d) => sum + Math.abs(d.activePower), 0)
})

const totalReactive = computed(() => {
  return powerFlow.value.reduce((sum, d) => sum + Math.abs(d.reactivePower), 0)
})

const overLimitCount = computed(() => {
  return powerFlow.value.filter((d) => d.isOverLimit).length
})
</script>

<template>
  <div class="h-screen flex flex-col" style="background-color: #0a1628">
    <div class="flex flex-1 min-h-0">
      <SideNav />

      <div class="flex-1 flex flex-col min-w-0 p-6 overflow-auto">
        <h1 class="text-xl font-semibold text-white mb-6">潮流分析</h1>

        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="rounded-lg p-4" style="background-color: #0d1f3c; border: 1px solid #1a3a5c">
            <div class="flex items-center gap-2 mb-2">
              <Zap :size="16" class="text-scada-blue" />
              <span class="text-gray-400 text-sm">总有功功率</span>
            </div>
            <div class="text-2xl font-mono text-scada-blue">{{ totalActive.toFixed(1) }} <span class="text-sm">MW</span></div>
          </div>
          <div class="rounded-lg p-4" style="background-color: #0d1f3c; border: 1px solid #1a3a5c">
            <div class="flex items-center gap-2 mb-2">
              <TrendingUp :size="16" class="text-scada-orange" />
              <span class="text-gray-400 text-sm">总无功功率</span>
            </div>
            <div class="text-2xl font-mono text-scada-orange">{{ totalReactive.toFixed(1) }} <span class="text-sm">MVar</span></div>
          </div>
          <div class="rounded-lg p-4" style="background-color: #0d1f3c; border: 1px solid #1a3a5c">
            <div class="flex items-center gap-2 mb-2">
              <AlertTriangle :size="16" class="text-scada-red" />
              <span class="text-gray-400 text-sm">越限线路</span>
            </div>
            <div class="text-2xl font-mono" :class="overLimitCount > 0 ? 'text-scada-red' : 'text-scada-green'">
              {{ overLimitCount }} <span class="text-sm">条</span>
            </div>
          </div>
        </div>

        <div class="flex-1 rounded-lg min-h-[400px]" style="background-color: #0d1f3c; border: 1px solid #1a3a5c">
          <div v-if="loading" class="h-full flex items-center justify-center text-gray-400 text-sm">
            加载潮流数据中...
          </div>
          <PowerFlowChart v-else :data="powerFlow" />
        </div>

        <div class="mt-4 flex items-center gap-6 text-xs text-gray-400">
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded" style="background-color: #00b4d8" />
            <span>有功功率</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded" style="background-color: #ff6b35" />
            <span>无功功率</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded" style="background-color: #ef4444" />
            <span>越限</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
