<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as d3 from 'd3'
import type { PowerFlowResult } from '@/types'

const props = defineProps<{
  data: PowerFlowResult[]
}>()

const chartRef = ref<HTMLDivElement | null>(null)

function renderChart() {
  if (!chartRef.value || props.data.length === 0) return

  const container = chartRef.value
  container.innerHTML = ''

  const width = container.clientWidth
  const height = container.clientHeight
  const margin = { top: 30, right: 30, bottom: 80, left: 60 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  const links = props.data
  const labels = links.map((d) => d.linkId)

  const x0 = d3.scaleBand<string>()
    .domain(labels)
    .range([0, innerWidth])
    .padding(0.3)

  const x1 = d3.scaleBand<string>()
    .domain(['active', 'reactive'])
    .range([0, x0.bandwidth()])
    .padding(0.1)

  const maxVal = d3.max(links, (d) => Math.max(Math.abs(d.activePower), Math.abs(d.reactivePower))) || 100

  const y = d3.scaleLinear()
    .domain([0, maxVal * 1.1])
    .range([innerHeight, 0])

  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x0).tickFormat((d: string) => {
      const link = links.find((l) => l.linkId === d)
      return link ? `${link.source}→${link.target}` : d
    }))
    .selectAll('text')
    .attr('transform', 'rotate(-35)')
    .style('text-anchor', 'end')
    .style('fill', '#94a3b8')
    .style('font-size', '9px')

  g.append('g')
    .call(d3.axisLeft(y).ticks(6))
    .selectAll('text')
    .style('fill', '#94a3b8')
    .style('font-size', '10px')

  g.selectAll('.domain, .tick line').attr('stroke', '#1a3a5c')

  g.append('text')
    .attr('x', -margin.left / 2)
    .attr('y', -10)
    .attr('fill', '#94a3b8')
    .attr('font-size', '11px')
    .text('MW/MVar')

  const barGroups = g.selectAll('.bar-group')
    .data(links)
    .enter()
    .append('g')
    .attr('transform', (d) => `translate(${x0(d.linkId)},0)`)

  barGroups.append('rect')
    .attr('x', x1('active') ?? 0)
    .attr('y', innerHeight)
    .attr('width', x1.bandwidth())
    .attr('height', 0)
    .attr('fill', (d) => d.isOverLimit ? '#ef4444' : '#00b4d8')
    .attr('rx', 2)
    .transition()
    .duration(800)
    .delay((_d, i) => i * 50)
    .attr('y', (d) => y(Math.abs(d.activePower)))
    .attr('height', (d) => innerHeight - y(Math.abs(d.activePower)))

  barGroups.append('rect')
    .attr('x', x1('reactive') ?? 0)
    .attr('y', innerHeight)
    .attr('width', x1.bandwidth())
    .attr('height', 0)
    .attr('fill', (d) => d.isOverLimit ? '#ef4444' : '#ff6b35')
    .attr('rx', 2)
    .transition()
    .duration(800)
    .delay((_d, i) => i * 50)
    .attr('y', (d) => y(Math.abs(d.reactivePower)))
    .attr('height', (d) => innerHeight - y(Math.abs(d.reactivePower)))

  const legend = svg.append('g')
    .attr('transform', `translate(${width - 180}, 10)`)

  legend.append('rect').attr('x', 0).attr('y', 0).attr('width', 12).attr('height', 12).attr('fill', '#00b4d8').attr('rx', 2)
  legend.append('text').attr('x', 16).attr('y', 10).attr('fill', '#94a3b8').attr('font-size', '11px').text('有功功率')

  legend.append('rect').attr('x', 80).attr('y', 0).attr('width', 12).attr('height', 12).attr('fill', '#ff6b35').attr('rx', 2)
  legend.append('text').attr('x', 96).attr('y', 10).attr('fill', '#94a3b8').attr('font-size', '11px').text('无功功率')
}

onMounted(() => {
  renderChart()
})

watch(() => props.data, () => {
  renderChart()
}, { deep: true })
</script>

<template>
  <div ref="chartRef" class="w-full h-full min-h-[300px]" style="background-color: #0a1628" />
</template>
