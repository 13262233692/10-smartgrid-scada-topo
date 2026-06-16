import { createRouter, createWebHistory } from 'vue-router'
import DispatchPage from '@/pages/DispatchPage.vue'
import PowerFlowPage from '@/pages/PowerFlowPage.vue'
import MonitorPage from '@/pages/MonitorPage.vue'

const routes = [
  {
    path: '/',
    name: 'dispatch',
    component: DispatchPage,
  },
  {
    path: '/power-flow',
    name: 'power-flow',
    component: PowerFlowPage,
  },
  {
    path: '/monitor',
    name: 'monitor',
    component: MonitorPage,
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
