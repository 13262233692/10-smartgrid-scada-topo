export type DeviceType = 'breaker' | 'busbar' | 'transformer' | 'line' | 'generator' | 'load'
export type DeviceStatus = 'on' | 'off' | 'fault'
export type DataQuality = 'good' | 'invalid' | 'old'

export interface TopologyNode {
  id: string
  type: DeviceType
  name: string
  x: number
  y: number
  voltage?: number
  status?: DeviceStatus
  ratings?: { current?: number; voltage?: number; activePower?: number; reactivePower?: number }
}

export interface TopologyLink {
  id: string
  source: string
  target: string
  type: 'electrical' | 'bus-tie'
  activePower?: number
  reactivePower?: number
  currentFlow?: number
}

export interface TopologyData {
  nodes: TopologyNode[]
  links: TopologyLink[]
  substationName: string
  voltageLevel: string
}

export interface TelemetryMetrics {
  current?: number
  voltage?: number
  activePower?: number
  reactivePower?: number
  frequency?: number
}

export interface TelemetryUpdate {
  nodeId: string
  metrics: TelemetryMetrics
  timestamp: number
  quality: DataQuality
}

export interface PowerFlowResult {
  linkId: string
  source: string
  target: string
  activePower: number
  reactivePower: number
  currentFlow: number
  direction: 'forward' | 'reverse'
  isOverLimit: boolean
  limitMW?: number
}

export interface ChannelStatus {
  id: string
  name: string
  type: 'iec104' | 'mqtt'
  status: 'online' | 'offline' | 'degraded'
  lastUpdate: number
  messageCount: number
}

export interface AlarmRecord {
  id: string
  nodeId: string
  nodeName: string
  level: 'info' | 'warning' | 'critical'
  message: string
  timestamp: number
  acknowledged: boolean
}

export interface ApiResponse<T> {
  success: boolean
  data: T
}

export type LoadPriority = 'critical' | 'important' | 'ordinary' | 'interruptible'

export interface LoadClassInfo {
  priority: LoadPriority
  name: string
  description: string
  shedOrder: number
}

export interface IslandInfo {
  id: string
  nodeIds: string[]
  generatorIds: string[]
  loadIds: string[]
  totalGenerationMW: number
  totalLoadMW: number
  powerDeficitMW: number
  frequency: number
  frequencyRate: number
  isBlackedOut: boolean
}

export interface ShedRound {
  round: number
  timestamp: number
  targetFrequency: number
  actualFrequency: number
  deficitMW: number
  sheddedLoadMW: number
  shedLoadIds: string[]
  shedLoadClass: LoadPriority
  description: string
}

export interface UFLSSimulationState {
  running: boolean
  startTime: number
  currentTime: number
  initialFaultNodeId: string | null
  islands: IslandInfo[]
  shedRounds: ShedRound[]
  totalSheddedMW: number
  currentFrequency: number
  status: 'idle' | 'running' | 'stabilized' | 'blackout'
  eventLog: { timestamp: number; level: 'info' | 'warning' | 'critical'; message: string }[]
  disabledNodes: string[]
  shedLoadNodes: string[]
}

export interface UFLSConfig {
  faultNodes: { id: string; name: string; type: string }[]
  loadClasses: Record<LoadPriority, LoadClassInfo>
  loadPriorityMap: Record<string, LoadPriority>
  params: {
    NOMINAL_FREQUENCY: number
    FIRST_STAGE_FREQ: number
    LAST_STAGE_FREQ: number
    FREQ_RELAY_STEP: number
  }
}
