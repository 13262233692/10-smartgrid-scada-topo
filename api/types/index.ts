export type DeviceType = 'breaker' | 'busbar' | 'transformer' | 'line' | 'generator' | 'load'
export type DeviceStatus = 'on' | 'off' | 'fault'
export type LinkType = 'electrical' | 'bus-tie'
export type DataQuality = 'good' | 'invalid' | 'old'
export type AlarmLevel = 'info' | 'warning' | 'critical'
export type StreamMessageType = 'telemetry' | 'alarm' | 'status_change'

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
  type: LinkType
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
  level: AlarmLevel
  message: string
  timestamp: number
  acknowledged: boolean
}

export interface StatusChangeEvent {
  nodeId: string
  nodeName: string
  fromStatus: DeviceStatus | null
  toStatus: DeviceStatus
  reason: string
  priority: 'critical' | 'high' | 'normal'
}

export interface StreamMessage {
  id: string
  type: StreamMessageType
  timestamp: number
  data: TelemetryUpdate | AlarmRecord | StatusChangeEvent
}

export interface StreamConsumerState {
  consumerName: string
  lastDeliveredId: string
  pendingCount: number
  lastClaimTime: number
}

export const STREAM_KEYS = {
  TELEMETRY: 'stream:telemetry',
  ALARMS: 'stream:alarms',
  STATUS_CHANGES: 'stream:status',
} as const

export const CONSUMER_GROUPS = {
  TELEMETRY_PROCESSOR: 'telemetry-processor-group',
  ALARM_DISPATCHER: 'alarm-dispatcher-group',
  STATUS_MONITOR: 'status-monitor-group',
} as const

export type LoadPriority = 'critical' | 'important' | 'ordinary' | 'interruptible'

export interface LoadClassInfo {
  priority: LoadPriority
  name: string
  description: string
  shedOrder: number
  shedPercentPerRound: number
}

export const LOAD_CLASSES: Record<LoadPriority, LoadClassInfo> = {
  interruptible: {
    priority: 'interruptible',
    name: '可中断负荷',
    description: '工业大用户、非生产负荷，可直接切除',
    shedOrder: 1,
    shedPercentPerRound: 100,
  },
  ordinary: {
    priority: 'ordinary',
    name: '普通负荷',
    description: '商业、一般居民，二级优先切除',
    shedOrder: 2,
    shedPercentPerRound: 50,
  },
  important: {
    priority: 'important',
    name: '重要负荷',
    description: '政府、大型企业、医院备用电源',
    shedOrder: 3,
    shedPercentPerRound: 30,
  },
  critical: {
    priority: 'critical',
    name: '特级负荷',
    description: '医院手术室、金融、应急指挥，最后保留',
    shedOrder: 4,
    shedPercentPerRound: 0,
  },
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
  eventLog: { timestamp: number; level: AlarmLevel; message: string }[]
}

export const UFLS_PARAMS = {
  NOMINAL_FREQUENCY: 50.0,
  RATE_OF_CHANGE_COEFF: 0.5,
  FIRST_STAGE_FREQ: 49.0,
  LAST_STAGE_FREQ: 46.0,
  FREQ_RELAY_STEP: 0.5,
  ROUND_DELAY_MS: 300,
  STABILIZATION_THRESHOLD: 49.9,
  INERTIA_CONSTANT_H: 3.5,
  SYSCAP_MVA: 1000,
} as const
