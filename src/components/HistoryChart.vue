<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as d3 from 'd3'
import type { TelemetryUpdate, TelemetryMetrics, ApiResponse } from '@/types'

const props = defineProps<{
  nodeId: string | null
}>()

const chartRef = ref<HTMLDivElement | null>(null)
const historyData = ref<TelemetryUpdate[]>([])

function fetchData() {
  if (!props.nodeId) {
    historyData.value = []
    return
  }
  fetch(`/api/telemetry/history/${props.nodeId}`)
    .then((res) => res.json())
    .then((json: ApiResponse<TelemetryUpdate[]>) => {
      if (json.success && json.data) {
        historyData.value = json.data
        renderChart()
      }
    })
    .catch(() => {})
}

function renderChart() {
  if (!chartRef.value || historyData.value.length === 0) return

  const container = chartRef.value
  container.innerHTML = ''

  const width = container.clientWidth
  const height = container.clientHeight
  const margin = { top: 20, right: 60, bottom: 40, left: 60 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  const data = historyData.value
  const timestamps = data.map((d) => d.timestamp)

  const x = d3.scaleLinear()
    .domain([d3.min(timestamps) ?? 0, d3.max(timestamps) ?? 1])
    .range([0, innerWidth])

  const metrics: { key: keyof TelemetryMetrics; color: string; label: string }[] = [
    { key: 'voltage', color: '#00b4d8', label: '电压(kV)' },
    { key: 'current', color: '#22c55e', label: '电流(A)' },
    { key: 'activePower', color: '#f59e0b', label: '有功(MW)' },
    { key: 'reactivePower', color: '#ff6b35', label: '无功(MVar)' },
    { key: 'frequency', color: '#a78bfa', label: '频率(Hz)' },
  ]

  const allValues: number[] = []
  for (const m of metrics) {
    for (const d of data) {
      const v = d.metrics[m.key]
      if (v != null) allValues.push(v)
    }
  }

  if (allValues.length === 0) return

  const y = d3.scaleLinear()
    .domain([d3.min(allValues) ?? 0, d3.max(allValues) ?? 100])
    .range([innerHeight, 0])

  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat((d: number) => {
      return new Date(d).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }))
    .selectAll('text')
    .style('fill', '#94a3b8')
    .style('font-size', '10px')

  g.append('g')
    .call(d3.axisLeft(y).ticks(6))
    .selectAll('text')
    .style('fill', '#94a3b8')
    .style('font-size', '10px')

  g.selectAll('.domain, .tick line').attr('stroke', '#1a3a5c')

  const line = d3.line<TelemetryUpdate>()
    .x((d) => x(d.timestamp))
    .y((d) => {
      const v = d.metrics[metrics[0].key]
      return y(v ?? 0)
    })
    .defined((d) => d.metrics[metrics[0].key] != null)

  for (const m of metrics) {
    const filtered = data.filter((d) => d.metrics[m.key] != null)
    if (filtered.length < 2) continue

    const lineGen = d3.line<TelemetryUpdate>()
      .x((d) => x(d.timestamp))
      .y((d) => y(d.metrics[m.key]!))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(filtered)
      .attr('fill', 'none')
      .attr('stroke', m.color)
      .attr('stroke-width', 1.5)
      .attr('d', lineGen)
  }

  const legend = svg.append('g')
    .attr('transform', `translate(${margin.left}, ${height - 10})`)

  let offsetX = 0
  for (const m of metrics) {
    const hasData = data.some((d) => d.metrics[m.key] != null)
    if (!hasData) continue
    legend.append('rect')
      .attr('x', offsetX)
      .attr('y', -8)
      .attr('width', 10)
      .attr('height', 3)
      .attr('fill', m.color)
    legend.append('text')
      .attr('x', offsetX + 14)
      .attr('y', -3)
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .text(m.label)
    offsetX += m.label.length * 11 + 24
  }
}

watch(() => props.nodeId, () => {
  fetchData()
})

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div ref="chartRef" class="w-full h-full min-h-[300px]" style="background-color: #0a1628" />
</template>
