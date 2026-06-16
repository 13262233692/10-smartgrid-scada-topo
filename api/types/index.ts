export type DeviceType = 'breaker' | 'busbar' | 'transformer' | 'line' | 'generator' | 'load'
export type DeviceStatus = 'on' | 'off' | 'fault'
export type LinkType = 'electrical' | 'bus-tie'
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
  level: 'info' | 'warning' | 'critical'
  message: string
  timestamp: number
  acknowledged: boolean
}
