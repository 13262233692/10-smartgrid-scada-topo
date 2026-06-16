<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import * as d3 from 'd3'
import type {
  TopologyData,
  TopologyNode,
  TopologyLink,
  TelemetryMetrics,
  UFLSSimulationState,
  UFLSConfig,
  IslandInfo,
  LoadPriority,
} from '@/types'

const props = defineProps<{
  topology: TopologyData | null
  telemetry: Map<string, TelemetryMetrics>
  uflsState: UFLSSimulationState | null
  loadPriorityMap: Record<string, LoadPriority>
}>()

const emit = defineEmits<{
  (e: 'node-click', nodeId: string): void
}>()

const svgRef = ref<SVGSVGElement | null>(null)
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null
let g: d3.Selection<SVGElement, unknown, null, undefined> | null = null
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let previousMetrics = new Map<string, TelemetryMetrics>()
const playedEffectNodes = new Set<string>()

const nodeWidth = 60
const nodeHeight = 40

const ISLAND_COLORS = ['#3b82f6', '#f97316', '#10b981', '#ef4444', '#8b5cf6']

const islandNodeMap = computed(() => {
  const map = new Map<string, IslandInfo>()
  if (!props.uflsState) return map
  for (const island of props.uflsState.islands) {
    for (const nodeId of island.nodeIds) {
      map.set(nodeId, island)
    }
  }
  return map
})

const shedLoadSet = computed(() => {
  return new Set(props.uflsState?.shedLoadNodes || [])
})

const disabledSet = computed(() => {
  return new Set(props.uflsState?.disabledNodes || [])
})

const islandColor = (nodeId: string): string => {
  const island = islandNodeMap.value.get(nodeId)
  if (!island) return '#6b7280'
  const idx = parseInt(island.id.replace('island-', '')) || 0
  return ISLAND_COLORS[idx % ISLAND_COLORS.length]
}

const priorityColor = (priority: LoadPriority): string => {
  switch (priority) {
    case 'interruptible': return '#f59e0b'
    case 'ordinary': return '#6b7280'
    case 'important': return '#3b82f6'
    case 'critical': return '#22c55e'
  }
}

function statusColor(status?: string): string {
  if (status === 'on') return '#22c55e'
  if (status === 'fault') return '#ef4444'
  return '#6b7280'
}

function formatValue(val: number | undefined, unit: string, decimals = 1): string {
  if (val == null) return ''
  return `${val.toFixed(decimals)} ${unit}`
}

function isShed(nodeId: string): boolean {
  return shedLoadSet.value.has(nodeId) || disabledSet.value.has(nodeId)
}

function getNodeFill(d: TopologyNode): string {
  if (disabledSet.value.has(d.id)) return '#374151'
  if (shedLoadSet.value.has(d.id)) return '#1f2937'
  if (props.uflsState && d.type !== 'busbar') {
    return islandColor(d.id)
  }
  return statusColor(d.status)
}

function renderBusbar(group: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>, d: TopologyNode) {
  const metrics = props.telemetry.get(d.id)
  const shed = isShed(d.id)
  const disabled = disabledSet.value.has(d.id)

  let fillColor = statusColor(d.status)
  if (props.uflsState && !shed && !disabled) {
    fillColor = islandColor(d.id)
  }
  if (shed || disabled) {
    fillColor = '#374151'
  }

  group.append('rect')
    .attr('x', -60)
    .attr('y', -6)
    .attr('width', 120)
    .attr('height', 12)
    .attr('rx', 2)
    .attr('fill', fillColor)
    .attr('class', shed ? 'node-shed' : '')

  group.append('rect')
    .attr('x', -60)
    .attr('y', -6)
    .attr('width', 120)
    .attr('height', 12)
    .attr('rx', 2)
    .attr('fill', 'none')
    .attr('stroke', fillColor)
    .attr('stroke-width', 1.5)
    .attr('filter', shed || disabled ? 'none' : 'url(#glow)')

  if (metrics) {
    const label = group.append('text')
      .attr('y', -16)
      .attr('text-anchor', 'middle')
      .attr('fill', shed ? '#6b7280' : '#00b4d8')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace')

    if (metrics.voltage != null) {
      label.text(formatValue(metrics.voltage, 'kV'))
    }
  }
}

function renderBreaker(group: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>, d: TopologyNode) {
  const isClosed = d.status === 'on'
  const shed = isShed(d.id)
  const disabled = disabledSet.value.has(d.id)

  let color = statusColor(d.status)
  if (props.uflsState && !shed && !disabled) {
    color = islandColor(d.id)
  }
  if (shed || disabled) {
    color = '#374151'
  }

  group.append('rect')
    .attr('x', -15)
    .attr('y', -20)
    .attr('width', 30)
    .attr('height', 40)
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', 2)
    .attr('rx', 3)

  group.append('line')
    .attr('x1', 0)
    .attr('y1', -20)
    .attr('x2', 0)
    .attr('y2', -8)
    .attr('stroke', color)
    .attr('stroke-width', 3)

  group.append('line')
    .attr('x1', 0)
    .attr('y1', 8)
    .attr('x2', 0)
    .attr('y2', 20)
    .attr('stroke', color)
    .attr('stroke-width', 3)

  if (isClosed && !shed && !disabled) {
    group.append('line')
      .attr('x1', 0)
      .attr('y1', -8)
      .attr('x2', 0)
      .attr('y2', 8)
      .attr('stroke', color)
      .attr('stroke-width', 3)
      .attr('filter', 'url(#glow)')
  } else if (!shed && !disabled) {
    group.append('line')
      .attr('x1', 0)
      .attr('y1', -8)
      .attr('x2', 8)
      .attr('y2', -2)
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 3)
  }

  if (shed) {
    group.attr('class', 'node-shed')
  }
}

function renderGenerator(group: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>, d: TopologyNode) {
  const metrics = props.telemetry.get(d.id)
  const shed = isShed(d.id)
  const disabled = disabledSet.value.has(d.id)

  let color = statusColor(d.status)
  if (props.uflsState && !shed && !disabled) {
    color = islandColor(d.id)
  }
  if (shed || disabled) {
    color = '#374151'
  }

  group.append('circle')
    .attr('cx', 0)
    .attr('cy', 0)
    .attr('r', 22)
    .attr('fill', '#0d1f3c')
    .attr('stroke', color)
    .attr('stroke-width', 2.5)

  group.append('text')
    .attr('x', 0)
    .attr('y', 5)
    .attr('text-anchor', 'middle')
    .attr('fill', color)
    .attr('font-size', '16px')
    .attr('font-weight', 'bold')
    .text('G')

  if (metrics?.activePower != null) {
    group.append('text')
      .attr('x', 0)
      .attr('y', 38)
      .attr('text-anchor', 'middle')
      .attr('fill', shed ? '#6b7280' : '#22c55e')
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(formatValue(metrics.activePower, 'MW'))
  }

  if (shed || disabled) {
    group.attr('class', 'node-shed')
  }
}

function renderTransformer(group: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>, d: TopologyNode) {
  const metrics = props.telemetry.get(d.id)
  const shed = isShed(d.id)
  const disabled = disabledSet.value.has(d.id)

  let color = statusColor(d.status)
  if (props.uflsState && !shed && !disabled) {
    color = islandColor(d.id)
  }
  if (shed || disabled) {
    color = '#374151'
  }

  group.append('circle')
    .attr('cx', 0)
    .attr('cy', -10)
    .attr('r', 14)
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', 2)

  group.append('circle')
    .attr('cx', 0)
    .attr('cy', 10)
    .attr('r', 14)
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', 2)

  if (metrics?.activePower != null) {
    group.append('text')
      .attr('x', 0)
      .attr('y', 36)
      .attr('text-anchor', 'middle')
      .attr('fill', shed ? '#6b7280' : '#00b4d8')
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(formatValue(metrics.activePower, 'MW'))
  }

  if (shed || disabled) {
    group.attr('class', 'node-shed')
  }
}

function renderLine(group: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>, d: TopologyNode) {
  const metrics = props.telemetry.get(d.id)
  const shed = isShed(d.id)
  const disabled = disabledSet.value.has(d.id)
  const priority = props.loadPriorityMap[d.id] || 'ordinary'

  let color = statusColor(d.status)
  if (props.uflsState && !shed && !disabled) {
    color = islandColor(d.id)
  }
  if (shed || disabled) {
    color = '#374151'
  }

  group.append('rect')
    .attr('x', -25)
    .attr('y', -4)
    .attr('width', 50)
    .attr('height', 8)
    .attr('rx', 4)
    .attr('fill', color)
    .attr('class', shed ? 'node-shed' : '')

  if (!shed && !disabled) {
    const prioDot = group.append('circle')
      .attr('cx', 20)
      .attr('cy', -10)
      .attr('r', 4)
      .attr('fill', priorityColor(priority))

    const prioLabel = priority === 'interruptible' ? '可中断'
      : priority === 'ordinary' ? '普通'
      : priority === 'important' ? '重要'
      : '特级'

    group.append('text')
      .attr('x', 0)
      .attr('y', -12)
      .attr('text-anchor', 'middle')
      .attr('fill', priorityColor(priority))
      .attr('font-size', '9px')
      .text(prioLabel)
  }

  if (metrics?.activePower != null) {
    group.append('text')
      .attr('x', 0)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('fill', shed ? '#6b7280' : '#00b4d8')
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(formatValue(metrics.activePower, 'MW'))
  }

  if (shed || disabled) {
    group.attr('class', 'node-shed')
  }
}

function renderNode(d: TopologyNode, group: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>) {
  switch (d.type) {
    case 'busbar':
      renderBusbar(group, d)
      break
    case 'breaker':
      renderBreaker(group, d)
      break
    case 'generator':
      renderGenerator(group, d)
      break
    case 'transformer':
      renderTransformer(group, d)
      break
    case 'line':
    case 'load':
      renderLine(group, d)
      break
  }

  group.append('text')
    .attr('x', 0)
    .attr('y', d.type === 'busbar' ? 24 : -28)
    .attr('text-anchor', 'middle')
    .attr('fill', '#94a3b8')
    .attr('font-size', '10px')
    .text(d.name)

  group.on('click', () => {
    emit('node-click', d.id)
  })

  group.style('cursor', 'pointer')
}

function render() {
  if (!svg || !g || !props.topology) return

  g.selectAll('*').remove()

  const defs = svg.append('defs')

  const glowFilter = defs.append('filter')
    .attr('id', 'glow')
  glowFilter.append('feGaussianBlur')
    .attr('stdDeviation', '2')
    .attr('result', 'coloredBlur')
  const merge = glowFilter.append('feMerge')
  merge.append('feMergeNode').attr('in', 'coloredBlur')
  merge.append('feMergeNode').attr('in', 'SourceGraphic')

  const ashGradient = defs.append('radialGradient')
    .attr('id', 'ashGradient')
  ashGradient.append('stop').attr('offset', '0%').attr('stop-color', '#6b7280').attr('stop-opacity', 0.8)
  ashGradient.append('stop').attr('offset', '100%').attr('stop-color', '#6b7280').attr('stop-opacity', 0)

  const linkGroup = g.append('g').attr('class', 'links')
  const nodeGroup = g.append('g').attr('class', 'nodes')

  const links = linkGroup.selectAll('.link')
    .data(props.topology.links, (d: any) => d.id)
    .enter()
    .append('g')
    .attr('class', 'link')

  links.each(function (d: TopologyLink) {
    const link = d3.select(this)
    const sourceNode = props.topology!.nodes.find((n) => n.id === d.source)
    const targetNode = props.topology!.nodes.find((n) => n.id === d.target)
    if (!sourceNode || !targetNode) return

    const sourceDisabled = disabledSet.value.has(d.source)
    const targetDisabled = disabledSet.value.has(d.target)
    const sourceShed = shedLoadSet.value.has(d.source)
    const targetShed = shedLoadSet.value.has(d.target)
    const isDimmed = sourceDisabled || targetDisabled || sourceShed || targetShed

    let strokeColor = '#3b4d6b'
    if (props.uflsState && !isDimmed) {
      strokeColor = islandColor(d.source)
    }
    if (isDimmed) {
      strokeColor = '#1e293b'
    }

    link.append('line')
      .attr('x1', sourceNode.x)
      .attr('y1', sourceNode.y)
      .attr('x2', targetNode.x)
      .attr('y2', targetNode.y)
      .attr('stroke', strokeColor)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', isDimmed ? '5,5' : 'none')
      .attr('opacity', isDimmed ? 0.4 : 1)
  })

  const nodes = nodeGroup.selectAll('.node')
    .data(props.topology.nodes, (d: any) => d.id)
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', (d: TopologyNode) => `translate(${d.x}, ${d.y})`)

  nodes.each(function (d: TopologyNode) {
    renderNode(d, d3.select(this) as d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>)
  })

  if (props.uflsState) {
    addAshParticles()
  }
}

function addAshParticles() {
  if (!g) return

  const shedNodes = props.uflsState?.shedLoadNodes || []
  const disabledNodes = props.uflsState?.disabledNodes || []
  const allDimmed = [...shedNodes, ...disabledNodes]

  const newDimmed = allDimmed.filter(id => !playedEffectNodes.has(id))
  if (newDimmed.length === 0) return

  const ashGroup = g.append('g').attr('class', 'ash-effects')

  for (const nodeId of newDimmed) {
    playedEffectNodes.add(nodeId)

    const node = props.topology?.nodes.find((n) => n.id === nodeId)
    if (!node) continue

    const particleCount = 25

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = 10 + Math.random() * 30
      const startX = node.x + Math.cos(angle) * dist * 0.3
      const startY = node.y + Math.sin(angle) * dist * 0.3

      const particle = ashGroup.append('circle')
        .attr('cx', startX)
        .attr('cy', startY)
        .attr('r', 1.5 + Math.random() * 3)
        .attr('fill', i % 3 === 0 ? '#4b5563' : '#6b7280')
        .attr('opacity', 0.7 + Math.random() * 0.3)
        .attr('class', 'ash-particle')

      const driftX = (Math.random() - 0.5) * 40
      const driftY = -20 - Math.random() * 50
      const duration = 2000 + Math.random() * 2000
      const delay = Math.random() * 500

      particle
        .transition()
        .delay(delay)
        .duration(duration)
        .ease(d3.easeCubicOut)
        .attr('cx', startX + driftX)
        .attr('cy', startY + driftY)
        .attr('r', 0.5)
        .attr('opacity', 0)
        .on('end', function () {
          d3.select(this).remove()
        })
    }

    const debrisCount = 8
    for (let i = 0; i < debrisCount; i++) {
      const angle = (Math.PI * 2 * i) / debrisCount + Math.random() * 0.5
      const dist = 15 + Math.random() * 20

      const debris = ashGroup.append('rect')
        .attr('x', node.x - 1)
        .attr('y', node.y - 1)
        .attr('width', 2 + Math.random() * 3)
        .attr('height', 2 + Math.random() * 3)
        .attr('fill', '#374151')
        .attr('opacity', 0.8)
        .attr('transform', `rotate(${Math.random() * 360}, ${node.x}, ${node.y})`)
        .attr('class', 'debris-particle')

      const endX = node.x + Math.cos(angle) * dist
      const endY = node.y + Math.sin(angle) * dist

      debris
        .transition()
        .delay(100 + Math.random() * 200)
        .duration(1500 + Math.random() * 1000)
        .ease(d3.easeQuadOut)
        .attr('x', endX)
        .attr('y', endY)
        .attr('opacity', 0)
        .attr('transform', `rotate(${Math.random() * 720}, ${endX}, ${endY})`)
        .on('end', function () {
          d3.select(this).remove()
        })
    }

    const ring = ashGroup.append('circle')
      .attr('cx', node.x)
      .attr('cy', node.y)
      .attr('r', 5)
      .attr('fill', 'none')
      .attr('stroke', '#6b7280')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.8)
      .attr('class', 'shockwave-ring')

    ring
      .transition()
      .duration(800)
      .ease(d3.easeCubicOut)
      .attr('r', 50)
      .attr('stroke-width', 0.5)
      .attr('opacity', 0)
      .on('end', function () {
        d3.select(this).remove()
      })
  }
}

function resetAshEffects() {
  playedEffectNodes.clear()
  if (g) {
    g.selectAll('.ash-effects').remove()
  }
}

function initSvg() {
  if (!svgRef.value || !props.topology) return

  svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const width = svgRef.value.clientWidth
  const height = svgRef.value.clientHeight

  zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 3])
    .on('zoom', (event) => {
      if (g) {
        g.attr('transform', event.transform.toString())
      }
    })

  svg.call(zoomBehavior)

  g = svg.append('g')
    .attr('class', 'topology-container')

  render()

  let scale = 0.8
  let offsetX = width * 0.1
  let offsetY = height * 0.1
  g.attr('transform', `translate(${offsetX}, ${offsetY}) scale(${scale})`)
}

watch(
  () => [props.topology, props.uflsState, props.telemetry.size],
  () => {
    if (props.uflsState?.status === 'idle') {
      resetAshEffects()
    }
    render()
  },
  { deep: true }
)

onMounted(() => {
  initSvg()
  window.addEventListener('resize', initSvg)
})

onUnmounted(() => {
  window.removeEventListener('resize', initSvg)
})
</script>

<template>
  <div class="w-full h-full relative bg-[#081524] rounded-lg overflow-hidden">
    <svg ref="svgRef" class="w-full h-full" style="min-height: 400px"></svg>

    <div v-if="uflsState" class="absolute top-3 left-3 bg-[#0d1f3c]/90 backdrop-blur rounded-lg p-3 border border-scada-border/50 text-xs">
      <div class="text-scada-blue font-bold mb-2">孤岛分布</div>
      <div v-for="island in uflsState.islands" :key="island.id" class="flex items-center gap-2 mb-1">
        <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: ISLAND_COLORS[parseInt(island.id.replace('island-', '')) % ISLAND_COLORS.length] }"></div>
        <span class="text-gray-300">{{ island.id }}</span>
        <span :class="island.isBlackedOut ? 'text-red-500' : 'text-gray-500'">
          {{ island.isBlackedOut ? '全黑' : `${island.frequency.toFixed(1)}Hz` }}
        </span>
      </div>
    </div>

    <div v-if="uflsState" class="absolute top-3 right-3 bg-[#0d1f3c]/90 backdrop-blur rounded-lg px-4 py-2 border border-scada-border/50">
      <div class="text-gray-400 text-xs mb-1">系统频率</div>
      <div
        class="text-2xl font-bold font-mono"
        :class="{
          'text-green-400': uflsState.currentFrequency >= 49.5,
          'text-yellow-400': uflsState.currentFrequency >= 48 && uflsState.currentFrequency < 49.5,
          'text-red-500': uflsState.currentFrequency < 48,
        }"
      >
        {{ uflsState.currentFrequency.toFixed(2) }}
        <span class="text-sm text-gray-400 font-normal">Hz</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-shed {
  opacity: 0.4;
}

@keyframes ash-float {
  0% {
    transform: translateY(0) scale(1);
    opacity: 0.7;
  }
  100% {
    transform: translateY(-30px) translateX(10px) scale(0.3);
    opacity: 0;
  }
}

.ash-particle {
  animation: ash-float 3s ease-out infinite;
}
</style>
