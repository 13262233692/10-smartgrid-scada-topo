import type { TopologyData } from '../types/index.js'

export const topologyData: TopologyData = {
  substationName: '220kV 智能变电站',
  voltageLevel: '220kV',
  nodes: [
    {
      id: 'bus-1',
      type: 'busbar',
      name: '220kV I段母线',
      x: 200,
      y: 200,
      voltage: 220,
      status: 'on',
      ratings: { voltage: 220, current: 2000 }
    },
    {
      id: 'bus-2',
      type: 'busbar',
      name: '220kV II段母线',
      x: 200,
      y: 600,
      voltage: 220,
      status: 'on',
      ratings: { voltage: 220, current: 2000 }
    },
    {
      id: 'brk-bustie',
      type: 'breaker',
      name: '母联断路器',
      x: 600,
      y: 400,
      status: 'on',
      ratings: { current: 2000, voltage: 220 }
    },
    {
      id: 'brk-line1',
      type: 'breaker',
      name: '出线1断路器',
      x: 100,
      y: 300,
      status: 'on',
      ratings: { current: 1250, voltage: 220 }
    },
    {
      id: 'line-1',
      type: 'line',
      name: '出线1',
      x: 100,
      y: 420,
      voltage: 220,
      status: 'on',
      ratings: { current: 1250, voltage: 220, activePower: 150, reactivePower: 30 }
    },
    {
      id: 'brk-gen1',
      type: 'breaker',
      name: '发电机1断路器',
      x: 250,
      y: 300,
      status: 'on',
      ratings: { current: 800, voltage: 220 }
    },
    {
      id: 'gen-1',
      type: 'generator',
      name: '发电机1',
      x: 250,
      y: 420,
      voltage: 220,
      status: 'on',
      ratings: { current: 800, voltage: 220, activePower: 200, reactivePower: 50 }
    },
    {
      id: 'brk-tf1',
      type: 'breaker',
      name: '主变1断路器',
      x: 400,
      y: 300,
      status: 'on',
      ratings: { current: 1250, voltage: 220 }
    },
    {
      id: 'tf-1',
      type: 'transformer',
      name: '主变1',
      x: 400,
      y: 420,
      voltage: 220,
      status: 'on',
      ratings: { current: 1250, voltage: 220, activePower: 240, reactivePower: 60 }
    },
    {
      id: 'brk-line2',
      type: 'breaker',
      name: '出线2断路器',
      x: 100,
      y: 700,
      status: 'on',
      ratings: { current: 1250, voltage: 220 }
    },
    {
      id: 'line-2',
      type: 'line',
      name: '出线2',
      x: 100,
      y: 760,
      voltage: 220,
      status: 'on',
      ratings: { current: 1250, voltage: 220, activePower: 150, reactivePower: 30 }
    },
    {
      id: 'brk-tf2',
      type: 'breaker',
      name: '主变2断路器',
      x: 800,
      y: 500,
      status: 'on',
      ratings: { current: 1250, voltage: 220 }
    },
    {
      id: 'tf-2',
      type: 'transformer',
      name: '主变2',
      x: 800,
      y: 380,
      voltage: 220,
      status: 'on',
      ratings: { current: 1250, voltage: 220, activePower: 240, reactivePower: 60 }
    },
    {
      id: 'brk-line3',
      type: 'breaker',
      name: '出线3断路器',
      x: 950,
      y: 500,
      status: 'on',
      ratings: { current: 1250, voltage: 220 }
    },
    {
      id: 'line-3',
      type: 'line',
      name: '出线3',
      x: 950,
      y: 380,
      voltage: 220,
      status: 'on',
      ratings: { current: 1250, voltage: 220, activePower: 150, reactivePower: 30 }
    },
    {
      id: 'brk-line4',
      type: 'breaker',
      name: '出线4断路器',
      x: 1050,
      y: 500,
      status: 'on',
      ratings: { current: 1250, voltage: 220 }
    },
    {
      id: 'line-4',
      type: 'line',
      name: '出线4',
      x: 1050,
      y: 380,
      voltage: 220,
      status: 'on',
      ratings: { current: 1250, voltage: 220, activePower: 150, reactivePower: 30 }
    },
    {
      id: 'brk-gen2',
      type: 'breaker',
      name: '发电机2断路器',
      x: 1100,
      y: 700,
      status: 'on',
      ratings: { current: 800, voltage: 220 }
    },
    {
      id: 'gen-2',
      type: 'generator',
      name: '发电机2',
      x: 1100,
      y: 760,
      voltage: 220,
      status: 'on',
      ratings: { current: 800, voltage: 220, activePower: 200, reactivePower: 50 }
    }
  ],
  links: [
    {
      id: 'link-bustie-bus1',
      source: 'bus-1',
      target: 'brk-bustie',
      type: 'electrical'
    },
    {
      id: 'link-bustie-bus2',
      source: 'brk-bustie',
      target: 'bus-2',
      type: 'bus-tie'
    },
    {
      id: 'link-bus1-brk-line1',
      source: 'bus-1',
      target: 'brk-line1',
      type: 'electrical'
    },
    {
      id: 'link-brk-line1-line1',
      source: 'brk-line1',
      target: 'line-1',
      type: 'electrical'
    },
    {
      id: 'link-bus1-brk-gen1',
      source: 'bus-1',
      target: 'brk-gen1',
      type: 'electrical'
    },
    {
      id: 'link-brk-gen1-gen1',
      source: 'brk-gen1',
      target: 'gen-1',
      type: 'electrical'
    },
    {
      id: 'link-bus1-brk-tf1',
      source: 'bus-1',
      target: 'brk-tf1',
      type: 'electrical'
    },
    {
      id: 'link-brk-tf1-tf1',
      source: 'brk-tf1',
      target: 'tf-1',
      type: 'electrical'
    },
    {
      id: 'link-bus2-brk-line2',
      source: 'bus-2',
      target: 'brk-line2',
      type: 'electrical'
    },
    {
      id: 'link-brk-line2-line2',
      source: 'brk-line2',
      target: 'line-2',
      type: 'electrical'
    },
    {
      id: 'link-bus2-brk-tf2',
      source: 'bus-2',
      target: 'brk-tf2',
      type: 'electrical'
    },
    {
      id: 'link-brk-tf2-tf2',
      source: 'brk-tf2',
      target: 'tf-2',
      type: 'electrical'
    },
    {
      id: 'link-bus2-brk-line3',
      source: 'bus-2',
      target: 'brk-line3',
      type: 'electrical'
    },
    {
      id: 'link-brk-line3-line3',
      source: 'brk-line3',
      target: 'line-3',
      type: 'electrical'
    },
    {
      id: 'link-bus2-brk-line4',
      source: 'bus-2',
      target: 'brk-line4',
      type: 'electrical'
    },
    {
      id: 'link-brk-line4-line4',
      source: 'brk-line4',
      target: 'line-4',
      type: 'electrical'
    },
    {
      id: 'link-bus2-brk-gen2',
      source: 'bus-2',
      target: 'brk-gen2',
      type: 'electrical'
    },
    {
      id: 'link-brk-gen2-gen2',
      source: 'brk-gen2',
      target: 'gen-2',
      type: 'electrical'
    }
  ]
}
