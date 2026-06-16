import type {
  TopologyData,
  TopologyNode,
  IslandInfo,
  ShedRound,
  UFLSSimulationState,
  LoadPriority,
} from '../types/index.js'
import {
  UFLS_PARAMS,
  LOAD_CLASSES,
} from '../types/index.js'
import { topologyData } from '../data/topology.js'

const LOAD_PRIORITY_MAP: Record<string, LoadPriority> = {
  'line-1': 'interruptible',
  'line-2': 'ordinary',
  'line-3': 'ordinary',
  'line-4': 'important',
  'tf-1': 'important',
  'tf-2': 'critical',
}

class UFLSSimulator {
  private state: UFLSSimulationState = {
    running: false,
    startTime: 0,
    currentTime: 0,
    initialFaultNodeId: null,
    islands: [],
    shedRounds: [],
    totalSheddedMW: 0,
    currentFrequency: UFLS_PARAMS.NOMINAL_FREQUENCY,
    status: 'idle',
    eventLog: [],
  }

  private baseTopology: TopologyData = topologyData
  private disabledNodes: Set<string> = new Set()
  private shedLoads: Set<string> = new Set()
  private simulationTimer: ReturnType<typeof setInterval> | null = null
  private roundIndex = 0
  private islandShedCooldown: Map<string, number> = new Map()

  getState(): UFLSSimulationState {
    return { ...this.state }
  }

  getDisabledNodes(): string[] {
    return Array.from(this.disabledNodes)
  }

  getShedLoads(): string[] {
    return Array.from(this.shedLoads)
  }

  reset(): void {
    this.stop()
    this.disabledNodes.clear()
    this.shedLoads.clear()
    this.roundIndex = 0
    this.islandShedCooldown.clear()
    this.state = {
      running: false,
      startTime: 0,
      currentTime: 0,
      initialFaultNodeId: null,
      islands: [],
      shedRounds: [],
      totalSheddedMW: 0,
      currentFrequency: UFLS_PARAMS.NOMINAL_FREQUENCY,
      status: 'idle',
      eventLog: [],
    }
  }

  triggerFault(nodeId: string): UFLSSimulationState {
    this.reset()
    this.state.initialFaultNodeId = nodeId
    this.state.startTime = Date.now()
    this.state.currentTime = Date.now()
    this.state.status = 'running'

    const node = this.baseTopology.nodes.find((n) => n.id === nodeId)
    if (!node) {
      throw new Error(`Node ${nodeId} not found`)
    }

    this.disabledNodes.add(nodeId)
    this.logEvent('critical', `故障触发: ${node.name} (${nodeId}) 断开`)

    this.islandDetection()
    this.calculateInitialFrequency()

    return this.getState()
  }

  startSimulation(): void {
    if (this.state.running) return
    if (this.state.status === 'idle') {
      throw new Error('No fault triggered')
    }

    this.state.running = true
    this.state.status = 'running'

    this.simulationTimer = setInterval(() => {
      this.simulateStep()
    }, UFLS_PARAMS.ROUND_DELAY_MS)
  }

  stop(): void {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer)
      this.simulationTimer = null
    }
    this.state.running = false
  }

  private simulateStep(): void {
    this.state.currentTime = Date.now()

    for (const island of this.state.islands) {
      if (island.isBlackedOut) continue
      if (island.totalGenerationMW === 0) {
        island.isBlackedOut = true
        island.frequency = 0
        this.logEvent('critical', `孤岛 ${island.id} 全黑: 无电源支撑`)
        continue
      }

      this.updateIslandFrequency(island)

      if (island.frequency >= UFLS_PARAMS.STABILIZATION_THRESHOLD) {
        this.logEvent('info', `孤岛 ${island.id} 频率恢复: ${island.frequency.toFixed(2)} Hz`)
        continue
      }

      if (island.frequency < UFLS_PARAMS.LAST_STAGE_FREQ) {
        if (!island.isBlackedOut) {
          island.isBlackedOut = true
          this.logEvent('critical', `孤岛 ${island.id} 频率崩溃: ${island.frequency.toFixed(2)} Hz，全黑停电`)
        }
        continue
      }

      if (island.frequency < UFLS_PARAMS.FIRST_STAGE_FREQ) {
        const lastShed = this.islandShedCooldown.get(island.id) || 0
        if (Date.now() - lastShed > UFLS_PARAMS.ROUND_DELAY_MS * 3) {
          const shedCount = this.performLoadShedding(island)
          if (shedCount > 0) {
            this.islandShedCooldown.set(island.id, Date.now())
          }
        }
      }
    }

    const minFreq = Math.min(...this.state.islands.map((i) => i.frequency))
    this.state.currentFrequency = minFreq

    const allStable = this.state.islands.every(
      (i) => i.isBlackedOut || i.frequency >= UFLS_PARAMS.STABILIZATION_THRESHOLD
    )
    const allBlack = this.state.islands.every((i) => i.isBlackedOut)

    if (allBlack) {
      this.state.status = 'blackout'
      this.stop()
      this.logEvent('critical', '系统全黑: 所有孤岛均失去电源')
    } else if (allStable) {
      this.state.status = 'stabilized'
      this.stop()
      this.logEvent('info', '系统稳定: 频率恢复至安全范围')
    }
  }

  private islandDetection(): void {
    const nodes = this.baseTopology.nodes.filter((n) => !this.disabledNodes.has(n.id))
    const links = this.baseTopology.links.filter(
      (l) => !this.disabledNodes.has(l.source) && !this.disabledNodes.has(l.target)
    )

    const adjacency: Map<string, string[]> = new Map()
    for (const node of nodes) {
      adjacency.set(node.id, [])
    }
    for (const link of links) {
      adjacency.get(link.source)?.push(link.target)
      adjacency.get(link.target)?.push(link.source)
    }

    const visited = new Set<string>()
    const islands: IslandInfo[] = []
    let islandIndex = 0

    for (const node of nodes) {
      if (visited.has(node.id)) continue

      const component: string[] = []
      const queue: string[] = [node.id]
      visited.add(node.id)

      while (queue.length > 0) {
        const current = queue.shift()!
        component.push(current)

        const neighbors = adjacency.get(current) || []
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            queue.push(neighbor)
          }
        }
      }

      const island = this.buildIsland(`island-${islandIndex}`, component)
      islands.push(island)
      islandIndex++
    }

    this.state.islands = islands
    this.logEvent('warning', `拓扑分析: 检测到 ${islands.length} 个孤岛电网`)
  }

  private buildIsland(id: string, nodeIds: string[]): IslandInfo {
    const nodeMap = new Map(this.baseTopology.nodes.map((n) => [n.id, n]))

    const generators = nodeIds.filter((nid) => {
      const n = nodeMap.get(nid)
      return n?.type === 'generator' && !this.shedLoads.has(nid)
    })

    const loadTypes: DeviceType[] = ['line', 'transformer']
    const loads = nodeIds.filter((nid) => {
      const n = nodeMap.get(nid)
      return n && loadTypes.includes(n.type) && !this.shedLoads.has(nid)
    })

    let totalGen = 0
    for (const gid of generators) {
      const g = nodeMap.get(gid)
      if (g?.ratings?.activePower) {
        totalGen += g.ratings.activePower
      }
    }

    let totalLoad = 0
    for (const lid of loads) {
      const l = nodeMap.get(lid)
      if (l?.ratings?.activePower) {
        totalLoad += l.ratings.activePower
      }
    }

    const deficit = totalLoad - totalGen

    return {
      id,
      nodeIds,
      generatorIds: generators,
      loadIds: loads,
      totalGenerationMW: totalGen,
      totalLoadMW: totalLoad,
      powerDeficitMW: deficit,
      frequency: UFLS_PARAMS.NOMINAL_FREQUENCY,
      frequencyRate: 0,
      isBlackedOut: totalGen === 0,
    }
  }

  private calculateInitialFrequency(): void {
    for (const island of this.state.islands) {
      if (island.totalGenerationMW === 0) {
        island.frequency = 0
        island.isBlackedOut = true
        continue
      }

      const deficitRatio = island.powerDeficitMW / Math.max(island.totalGenerationMW, 1)
      island.frequencyRate = -deficitRatio * UFLS_PARAMS.RATE_OF_CHANGE_COEFF

      const initialDrop = deficitRatio * 1.5
      island.frequency = Math.max(
        UFLS_PARAMS.FIRST_STAGE_FREQ + 0.3,
        UFLS_PARAMS.NOMINAL_FREQUENCY - initialDrop
      )
    }

    const minFreq = Math.min(...this.state.islands.map((i) => i.frequency))
    this.state.currentFrequency = minFreq

    this.logEvent(
      'warning',
      `初始频率 ${minFreq.toFixed(2)} Hz，功率缺额 ${this.state.islands.reduce((s, i) => s + Math.max(0, i.powerDeficitMW), 0).toFixed(1)} MW`
    )
  }

  private updateIslandFrequency(island: IslandInfo): void {
    if (island.isBlackedOut || island.totalGenerationMW === 0) return

    const deficitRatio = island.powerDeficitMW / Math.max(island.totalGenerationMW, 1)
    const freqChangePerStep = deficitRatio * -0.15

    const newFreq = island.frequency + freqChangePerStep

    if (newFreq >= UFLS_PARAMS.NOMINAL_FREQUENCY) {
      island.frequency = UFLS_PARAMS.NOMINAL_FREQUENCY
      island.frequencyRate = 0
    } else if (newFreq <= 0) {
      island.frequency = 0
      island.isBlackedOut = true
    } else {
      island.frequency = newFreq
      island.frequencyRate = freqChangePerStep / (UFLS_PARAMS.ROUND_DELAY_MS / 1000)
    }
  }

  private performLoadShedding(island: IslandInfo): number {
    if (island.loadIds.length === 0) return 0

    const targetDeficit = island.powerDeficitMW
    if (targetDeficit <= 0) return 0

    const nodeMap = new Map(this.baseTopology.nodes.map((n) => [n.id, n]))

    const loadsByPriority = new Map<LoadPriority, { id: string; power: number }[]>()
    for (const lid of island.loadIds) {
      const node = nodeMap.get(lid)
      const priority = LOAD_PRIORITY_MAP[lid] || 'ordinary'
      const power = node?.ratings?.activePower || 0
      if (!loadsByPriority.has(priority)) {
        loadsByPriority.set(priority, [])
      }
      loadsByPriority.get(priority)!.push({ id: lid, power })
    }

    const priorityOrder: LoadPriority[] = ['interruptible', 'ordinary', 'important', 'critical']

    let shedClass: LoadPriority | null = null
    let shedIds: string[] = []
    let shedded = 0

    for (const priority of priorityOrder) {
      if (priority === 'critical') continue
      const loads = loadsByPriority.get(priority)
      if (!loads || loads.length === 0) continue

      shedClass = priority
      for (const load of loads) {
        shedIds.push(load.id)
        shedded += load.power
        this.shedLoads.add(load.id)
      }
      break
    }

    if (shedIds.length === 0 || !shedClass) return 0

    this.roundIndex++
    const round: ShedRound = {
      round: this.roundIndex,
      timestamp: Date.now(),
      targetFrequency: UFLS_PARAMS.FIRST_STAGE_FREQ - (this.roundIndex - 1) * UFLS_PARAMS.FREQ_RELAY_STEP,
      actualFrequency: island.frequency,
      deficitMW: targetDeficit,
      sheddedLoadMW: shedded,
      shedLoadIds: shedIds,
      shedLoadClass: shedClass,
      description: `第 ${this.roundIndex} 轮减载 [${LOAD_CLASSES[shedClass].name}]: 切除 ${shedIds.length} 个负荷，共 ${shedded.toFixed(1)} MW`,
    }

    this.state.shedRounds.push(round)
    this.state.totalSheddedMW += shedded

    const loadNames = shedIds
      .map((id) => nodeMap.get(id)?.name || id)
      .join('、')

    this.logEvent(
      'warning',
      `第${this.roundIndex}轮减载 [${LOAD_CLASSES[shedClass].name}]: 切除 ${loadNames}，共 ${shedded.toFixed(1)} MW`
    )

    const updatedIsland = this.buildIsland(island.id, island.nodeIds)
    island.loadIds = updatedIsland.loadIds
    island.totalLoadMW = updatedIsland.totalLoadMW
    island.powerDeficitMW = updatedIsland.powerDeficitMW

    const freqBoost = (shedded / island.totalGenerationMW) * 2
    island.frequency = Math.min(UFLS_PARAMS.NOMINAL_FREQUENCY, island.frequency + freqBoost)

    if (island.powerDeficitMW <= 0) {
      island.frequency = UFLS_PARAMS.NOMINAL_FREQUENCY - 0.2
      this.logEvent('info', `孤岛 ${island.id} 减载后功率平衡，频率恢复至 ${island.frequency.toFixed(2)} Hz`)
    }

    return shedIds.length
  }

  private logEvent(level: 'info' | 'warning' | 'critical', message: string): void {
    this.state.eventLog.unshift({
      timestamp: Date.now(),
      level,
      message,
    })
    if (this.state.eventLog.length > 100) {
      this.state.eventLog.length = 100
    }
  }

  getAvailableFaultNodes(): { id: string; name: string; type: string }[] {
    return this.baseTopology.nodes
      .filter((n) => n.type === 'line' || n.type === 'generator' || n.type === 'breaker')
      .map((n) => ({ id: n.id, name: n.name, type: n.type }))
  }

  getLoadPriorityMap(): Record<string, LoadPriority> {
    return { ...LOAD_PRIORITY_MAP }
  }
}

export const uflsSimulator = new UFLSSimulator()
