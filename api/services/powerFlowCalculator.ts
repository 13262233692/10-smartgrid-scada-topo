import type { TopologyData, TelemetryMetrics, PowerFlowResult } from '../types/index.js'

export function calculatePowerFlow(
  topology: TopologyData,
  telemetry: Map<string, TelemetryMetrics>
): PowerFlowResult[] {
  const results: PowerFlowResult[] = []
  const nodeMap = new Map(topology.nodes.map((n) => [n.id, n]))

  for (const link of topology.links) {
    const sourceNode = nodeMap.get(link.source)
    const targetNode = nodeMap.get(link.target)

    if (!sourceNode || !targetNode) continue

    const sourceTelemetry = telemetry.get(link.source)
    const targetTelemetry = telemetry.get(link.target)

    const sourceVoltage = sourceTelemetry?.voltage ?? sourceNode.voltage ?? 220
    const targetVoltage = targetTelemetry?.voltage ?? targetNode.voltage ?? 220

    const v1pu = sourceVoltage / 220
    const v2pu = targetVoltage / 220

    const reactance = getReactance(sourceNode.type, targetNode.type, link.type)
    const theta1 = estimateAngle(sourceNode.type, sourceTelemetry)
    const theta2 = estimateAngle(targetNode.type, targetTelemetry)
    const deltaTheta = theta1 - theta2

    let activePower = (v1pu * v2pu * Math.sin(deltaTheta)) / reactance
    let reactivePower = (v1pu * (v1pu - v2pu * Math.cos(deltaTheta))) / reactance

    if (sourceTelemetry?.activePower != null && targetTelemetry?.activePower != null) {
      activePower = (sourceTelemetry.activePower + targetTelemetry.activePower) / 2
      if (sourceNode.type === 'generator') activePower = sourceTelemetry.activePower
      if (targetNode.type === 'generator') activePower = targetTelemetry.activePower
    } else if (sourceTelemetry?.activePower != null) {
      activePower = sourceTelemetry.activePower * 0.95
    } else if (targetTelemetry?.activePower != null) {
      activePower = targetTelemetry.activePower * 0.95
    }

    if (sourceTelemetry?.reactivePower != null && targetTelemetry?.reactivePower != null) {
      reactivePower = (sourceTelemetry.reactivePower + targetTelemetry.reactivePower) / 2
    } else if (sourceTelemetry?.reactivePower != null) {
      reactivePower = sourceTelemetry.reactivePower * 0.95
    } else if (targetTelemetry?.reactivePower != null) {
      reactivePower = targetTelemetry.reactivePower * 0.95
    }

    activePower = Math.abs(activePower) < 0.01 ? 0 : activePower
    reactivePower = Math.abs(reactivePower) < 0.01 ? 0 : reactivePower

    const vAvg = (sourceVoltage + targetVoltage) / 2
    const currentFlow = vAvg > 0 ? (Math.sqrt(activePower ** 2 + reactivePower ** 2) / vAvg) * 1000 : 0

    const direction: 'forward' | 'reverse' = sourceVoltage >= targetVoltage ? 'forward' : 'reverse'

    const limitMW = getLimitMW(sourceNode, targetNode, link.type)
    const isOverLimit = limitMW != null ? Math.abs(activePower) > 0.9 * limitMW : false

    results.push({
      linkId: link.id,
      source: link.source,
      target: link.target,
      activePower: Math.round(activePower * 100) / 100,
      reactivePower: Math.round(reactivePower * 100) / 100,
      currentFlow: Math.round(currentFlow * 10) / 10,
      direction,
      isOverLimit,
      limitMW,
    })
  }

  return results
}

function getReactance(sourceType: string, targetType: string, linkType: string): number {
  if (linkType === 'bus-tie') return 0.01
  if (sourceType === 'transformer' || targetType === 'transformer') return 0.12
  if (sourceType === 'generator' || targetType === 'generator') return 0.08
  if (sourceType === 'line' || targetType === 'line') return 0.06
  return 0.1
}

function estimateAngle(nodeType: string, telemetry?: TelemetryMetrics): number {
  const baseAngles: Record<string, number> = {
    generator: 0.15,
    busbar: 0.0,
    transformer: -0.05,
    line: -0.08,
    breaker: 0.0,
    load: -0.12,
  }
  const base = baseAngles[nodeType] ?? 0.0
  const jitter = (Math.random() - 0.5) * 0.005
  return base + jitter
}

function getLimitMW(
  sourceNode: TopologyData['nodes'][0],
  targetNode: TopologyData['nodes'][0],
  linkType: string
): number | undefined {
  const sourceRating = sourceNode.ratings?.activePower
  const targetRating = targetNode.ratings?.activePower
  if (sourceRating != null && targetRating != null) {
    return Math.min(sourceRating, targetRating)
  }
  return sourceRating ?? targetRating
}
