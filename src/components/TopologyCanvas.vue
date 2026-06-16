<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as d3 from 'd3'
import type { TopologyData, TelemetryMetrics, PowerFlowResult, TopologyNode, TopologyLink } from '@/types'

const props = defineProps<{
  topology: TopologyData | null
  telemetry: Map<string, TelemetryMetrics>
  powerFlow: PowerFlowResult[]
}>()

const emit = defineEmits<{
  (e: 'node-click', nodeId: string): void
}>()

const svgRef = ref<SVGSVGElement | null>(null)
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null
let g: d3.Selection<SVGElement, unknown, null, undefined> | null = null
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let previousMetrics = new Map<string, TelemetryMetrics>()

const nodeWidth = 60
const nodeHeight = 40

function statusColor(status?: string): string {
  if (status === 'on') return '#22c55e'
  if (status === 'fault') return '#ef4444'
  return '#6b7280'
}

function formatValue(val: number | undefined, unit: string, decimals = 1): string {
  if (val == null) return ''
  return `${val.toFixed(decimals)} ${unit}`
}

function isOverLimit(node: TopologyNode, metrics: TelemetryMetrics): boolean {
  if (!node.ratings) return false
  if (metrics.activePower != null && node.ratings.activePower != null) {
    if (metrics.activePower / node.ratings.activePower > 0.9) return true
  }
  if (metrics.current != null && node.ratings.current != null) {
    if (metrics.current / node.ratings.current > 0.9) return true
  }
  return false
}

function renderBusbar(group: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>, d: TopologyNode) {
  const metrics = props.telemetry.get(d.id)
  const color = statusColor(d.status)

  group.append('rect')
    .attr('x', -60)
    .attr('y', -6)
    .attr('width', 120)
    .attr('height', 12)
    .attr('rx', 2)
    .attr('fill', color)
    .attr('class', d.status === 'on' ? 'busbar-energized' : '')

  group.append('rect')
    .attr('x', -60)
    .attr('y', -6)
    .attr('width', 120)
    .attr('height', 12)
    .attr('rx', 2)
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', 1.5)
    .attr('filter', d.status === 'on' ? 'url(#glow)' : 'none')

  if (metrics) {
    const overLimit = isOverLimit(d, metrics)
    const labelColor = overLimit ? '#ef4444' : '#00b4d8'
    const label = group.append('text')
      .attr('y', -16)
      .attr('text-anchor', 'middle')
      .attr('fill', labelColor)
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace')

    if (metrics.voltage != null) {
      label.text(formatValue(metrics.voltage, 'kV'))
    }
    if (overLimit) {
      label.attr('class', 'data-flash')
    }
    const prev = previousMetrics.get(d.id)
    if (prev && prev.voltage !== metrics.voltage) {
      label.attr('class', (overLimit ? 'data-flash ' : '') + 'data-update')
    }
  }
}

function renderBreaker(group: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>, d: TopologyNode) {
  const metrics = props.telemetry.get(d.id)
  const isClosed = d.status === 'on'
  const color = statusColor(d.status)

  group.append('rect')
    .attr('x', -15)
    .attr('y', -15)
    .attr('width', 30)
    .attr('height', 30)
    .attr('rx', 3)
    .attr('fill', '#0a1628')
    .attr('stroke', color)
    .attr('stroke-width', 2)

  if (isClosed) {
    group.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 5)
      .attr('fill', color)
      .attr('font-size', '16px')
      .attr('font-weight', 'bold')
      .text('×')
  } else {
    group.append('circle')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', 7)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2)
  }

  if (metrics && metrics.current != null) {
    const overLimit = isOverLimit(d, metrics)
    const labelColor = overLimit ? '#ef4444' : '#00b4d8'
    const label = group.append('text')
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('fill', labelColor)
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(formatValue(metrics.current, 'A'))
    if (overLimit) label.attr('class', 'data-flash')
  }
}

function renderTransformer(group: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>, d: TopologyNode) {
  const metrics = props.telemetry.get(d.id)

  group.append('circle')
    .attr('cx', -10)
    .attr('cy', 0)
    .attr('r', 16)
    .attr('fill', 'none')
    .attr('stroke', statusColor(d.status))
    .attr('stroke-width', 2)

  group.append('circle')
    .attr('cx', 10)
    .attr('cy', 0)
    .attr('r', 16)
    .attr('fill', 'none')
    .attr('stroke', statusColor(d.status))
    .attr('stroke-width', 2)

  if (metrics) {
    const overLimit = isOverLimit(d, metrics)
    const labelColor = overLimit ? '#ef4444' : '#00b4d8'
    let text = ''
    if (metrics.activePower != null && d.ratings?.activePower != null) {
      const loadRate = ((metrics.activePower / d.ratings.activePower) * 100).toFixed(1)
      text = `${loadRate}%`
    } else if (metrics.activePower != null) {
      text = formatValue(metrics.activePower, 'MW')
    }
    if (text) {
      const label = group.append('text')
        .attr('y', -24)
        .attr('text-anchor', 'middle')
        .attr('fill', labelColor)
        .attr('font-size', '10px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .text(text)
      if (overLimit) label.attr('class', 'data-flash')
    }
  }
}

function renderLine(group: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>, d: TopologyNode) {
  const metrics = props.telemetry.get(d.id)
  const color = statusColor(d.status)

  group.append('line')
    .attr('x1', -15)
    .attr('y1', -10)
    .attr('x2', 15)
    .attr('y2', -10)
    .attr('stroke', color)
    .attr('stroke-width', 2)

  group.append('polygon')
    .attr('points', '8,-16 15,-10 8,-4')
    .attr('fill', color)

  group.append('line')
    .attr('x1', -15)
    .attr('y1', 4)
    .attr('x2', 15)
    .attr('y2', 4)
    .attr('stroke', color)
    .attr('stroke-width', 2)

  if (metrics) {
    const overLimit = isOverLimit(d, metrics)
    const labelColor = overLimit ? '#ef4444' : '#00b4d8'
    const parts: string[] = []
    if (metrics.activePower != null) parts.push(formatValue(metrics.activePower, 'MW'))
    if (metrics.reactivePower != null) parts.push(formatValue(metrics.reactivePower, 'MVar'))
    if (parts.length > 0) {
      const label = group.append('text')
        .attr('y', 22)
        .attr('text-anchor', 'middle')
        .attr('fill', labelColor)
        .attr('font-size', '9px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .text(parts.join(' / '))
      if (overLimit) label.attr('class', 'data-flash')
    }
  }
}

function renderGenerator(group: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>, d: TopologyNode) {
  const metrics = props.telemetry.get(d.id)
  const color = statusColor(d.status)

  group.append('circle')
    .attr('cx', 0)
    .attr('cy', 0)
    .attr('r', 18)
    .attr('fill', '#0a1628')
    .attr('stroke', color)
    .attr('stroke-width', 2)

  group.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', 5)
    .attr('fill', color)
    .attr('font-size', '16px')
    .attr('font-weight', 'bold')
    .text('~')

  if (metrics) {
    const overLimit = isOverLimit(d, metrics)
    const labelColor = overLimit ? '#ef4444' : '#00b4d8'
    if (metrics.activePower != null) {
      const label = group.append('text')
        .attr('y', -26)
        .attr('text-anchor', 'middle')
        .attr('fill', labelColor)
        .attr('font-size', '10px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .text(formatValue(metrics.activePower, 'MW'))
      if (overLimit) label.attr('class', 'data-flash')
    }
  }
}

function renderLoad(group: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>, d: TopologyNode) {
  const color = statusColor(d.status)

  group.append('polygon')
    .attr('points', '0,-16 14,10 -14,10')
    .attr('fill', '#0a1628')
    .attr('stroke', color)
    .attr('stroke-width', 2)
}

const renderers: Record<string, (g: d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>, d: TopologyNode) => void> = {
  busbar: renderBusbar,
  breaker: renderBreaker,
  transformer: renderTransformer,
  line: renderLine,
  generator: renderGenerator,
  load: renderLoad,
}

function renderTopology() {
  if (!svgRef.value || !props.topology) return

  svg = d3.select(svgRef.value)

  svg.selectAll('*').remove()

  const defs = svg.append('defs')

  const filter = defs.append('filter').attr('id', 'glow')
  filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur')
  const feMerge = filter.append('feMerge')
  feMerge.append('feMergeNode').attr('in', 'coloredBlur')
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

  defs.append('marker')
    .attr('id', 'arrow-forward')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 8)
    .attr('refY', 5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto-start-reverse')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', '#00b4d8')

  defs.append('marker')
    .attr('id', 'arrow-reverse')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 8)
    .attr('refY', 5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', '#ff6b35')

  defs.append('marker')
    .attr('id', 'arrow-overlimit')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 8)
    .attr('refY', 5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto-start-reverse')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', '#ef4444')

  g = svg.append('g') as unknown as d3.Selection<SVGElement, unknown, null, undefined>

  zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 5])
    .on('zoom', (event) => {
      if (g) {
        g.attr('transform', event.transform.toString())
      }
    })

  svg.call(zoomBehavior)

  const nodeMap = new Map<string, TopologyNode>()
  for (const node of props.topology.nodes) {
    nodeMap.set(node.id, node)
  }

  const powerFlowMap = new Map<string, PowerFlowResult>()
  for (const pf of props.powerFlow) {
    powerFlowMap.set(pf.linkId, pf)
  }

  const linkGroup = g.append('g').attr('class', 'links')

  linkGroup.selectAll('g')
    .data(props.topology.links)
    .enter()
    .append('g')
    .each(function (d: TopologyLink) {
      const linkG = d3.select(this)
      const sourceNode = nodeMap.get(d.source)
      const targetNode = nodeMap.get(d.target)
      if (!sourceNode || !targetNode) return

      const x1 = sourceNode.x
      const y1 = sourceNode.y
      const x2 = targetNode.x
      const y2 = targetNode.y

      const pf = powerFlowMap.get(d.id)
      const isOverLimitLink = pf?.isOverLimit ?? false
      const strokeColor = isOverLimitLink ? '#ef4444' : (d.type === 'bus-tie' ? '#ff6b35' : '#1a3a5c')
      const strokeWidth = isOverLimitLink ? 3 : 2

      linkG.append('line')
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth)
        .attr('stroke-dasharray', d.type === 'bus-tie' ? '6,3' : 'none')

      if (pf) {
        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2
        const dx = x2 - x1
        const dy = y2 - y1
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len > 0) {
          const angle = Math.atan2(dy, dx) * 180 / Math.PI
          const arrowId = isOverLimitLink ? 'arrow-overlimit' : (pf.direction === 'forward' ? 'arrow-forward' : 'arrow-reverse')

          if (pf.direction === 'forward') {
            linkG.append('line')
              .attr('x1', x1)
              .attr('y1', y1)
              .attr('x2', x2)
              .attr('y2', y2)
              .attr('stroke', 'transparent')
              .attr('stroke-width', 10)
              .attr('marker-mid', `url(#${arrowId})`)
          }

          linkG.append('polygon')
            .attr('points', '-5,-4 5,0 -5,4')
            .attr('fill', isOverLimitLink ? '#ef4444' : (pf.direction === 'forward' ? '#00b4d8' : '#ff6b35'))
            .attr('transform', `translate(${midX},${midY}) rotate(${angle})`)
            .attr('class', 'flow-arrow')

          const flowText = `${pf.activePower.toFixed(1)}MW`
          linkG.append('text')
            .attr('x', midX + 12)
            .attr('y', midY - 8)
            .attr('fill', isOverLimitLink ? '#ef4444' : '#94a3b8')
            .attr('font-size', '9px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .text(flowText)
        }
      }
    })

  const nodeGroup = g.append('g').attr('class', 'nodes')

  nodeGroup.selectAll('g')
    .data(props.topology.nodes)
    .enter()
    .append('g')
    .attr('transform', (d: TopologyNode) => `translate(${d.x},${d.y})`)
    .attr('class', 'topology-node')
    .style('cursor', 'pointer')
    .each(function (d: TopologyNode) {
      const nodeG = d3.select(this) as d3.Selection<SVGGElement, TopologyNode, SVGGElement, TopologyNode>
      const renderer = renderers[d.type]
      if (renderer) renderer(nodeG, d)
    })
    .on('click', (_event: MouseEvent, d: TopologyNode) => {
      emit('node-click', d.id)
    })
    .on('mouseenter', function () {
      d3.select(this).select('rect, circle, polygon').raise()
      d3.select(this).raise()
    })

  nodeGroup.selectAll('.topology-node')
    .append('text')
    .attr('y', (d: TopologyNode) => {
      if (d.type === 'busbar') return 26
      if (d.type === 'breaker') return 42
      return 34
    })
    .attr('text-anchor', 'middle')
    .attr('fill', '#94a3b8')
    .attr('font-size', '10px')
    .attr('font-family', 'Noto Sans SC, sans-serif')
    .text((d: TopologyNode) => d.name)

  previousMetrics = new Map(props.telemetry)
}

watch(() => [props.topology, props.telemetry, props.powerFlow] as const, () => {
  renderTopology()
}, { deep: true })

onMounted(() => {
  renderTopology()
})

onUnmounted(() => {
  svg = null
  g = null
  zoomBehavior = null
})
</script>

<template>
  <div class="w-full h-full relative overflow-hidden" style="background-color: #0a1628">
    <svg ref="svgRef" class="w-full h-full" />
  </div>
</template>

<style scoped>
.flow-arrow {
  animation: flow-pulse 1.5s ease-in-out infinite;
}

@keyframes flow-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.busbar-energized {
  animation: pulse-glow 2s ease-in-out infinite;
}

:deep(.data-flash) {
  animation: blink 0.8s ease-in-out infinite;
}

:deep(.data-update) {
  animation: flash-in 0.4s ease-out;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@keyframes flash-in {
  0% { opacity: 0.3; transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}
</style>
