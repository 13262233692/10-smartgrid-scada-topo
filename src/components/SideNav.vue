<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Activity, TrendingUp, Monitor, Zap, ChevronLeft, ChevronRight } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const collapsed = ref(true)

const navItems = [
  { icon: Activity, label: '调度台', path: '/' },
  { icon: TrendingUp, label: '潮流分析', path: '/power-flow' },
  { icon: Monitor, label: '系统监控', path: '/monitor' },
  { icon: Zap, label: '低频减载', path: '/ufls' },
]

function navigate(path: string) {
  router.push(path)
}

function toggleCollapse() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <nav
    class="h-full flex flex-col transition-all duration-300 ease-in-out"
    :class="collapsed ? 'w-16' : 'w-[200px]'"
    style="background-color: #0d1f3c"
  >
    <div class="flex items-center h-14 px-3 border-b border-scada-border overflow-hidden">
      <div
        class="text-scada-blue font-bold whitespace-nowrap transition-opacity duration-200"
        :class="collapsed ? 'opacity-0 w-0' : 'opacity-100'"
      >
        SCADA 系统
      </div>
      <div
        class="text-scada-blue font-bold text-lg"
        :class="collapsed ? 'mx-auto' : 'hidden'"
      >
        S
      </div>
    </div>

    <div class="flex-1 py-2">
      <button
        v-for="item in navItems"
        :key="item.path"
        class="w-full flex items-center h-12 px-4 transition-colors duration-150 hover:bg-scada-border/50"
        :class="route.path === item.path ? 'bg-scada-border/70 text-scada-blue' : 'text-gray-400'"
        @click="navigate(item.path)"
      >
        <component :is="item.icon" :size="20" class="shrink-0" />
        <span
          class="ml-3 text-sm whitespace-nowrap transition-opacity duration-200"
          :class="collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'"
        >
          {{ item.label }}
        </span>
      </button>
    </div>

    <button
      class="flex items-center justify-center h-10 border-t border-scada-border text-gray-400 hover:text-scada-blue transition-colors"
      @click="toggleCollapse"
    >
      <component :is="collapsed ? ChevronRight : ChevronLeft" :size="18" />
    </button>
  </nav>
</template>
