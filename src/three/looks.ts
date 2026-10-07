import * as THREE from 'three'

/**
 * Studio "looks": colour + intensity for each light panel, the backdrop and the
 * floor light pool. Panels only light the car through reflections (see LightRig).
 */
export type PanelName = 'top' | 'sideL' | 'sideR' | 'rim' | 'fill'
export type LookId = 'graphite' | 'rosso' | 'concrete' | 'industrial' | 'tailored' | 'steel'

type LookDef = {
  bg: string
  panels: Record<PanelName, [color: string, intensity: number]>
  pool: [color: string, intensity: number]
}

/*
 * One photographic language for every car: a near-black cove, a big soft
 * overhead key, two long raking strips for the flank highlights and a cool rim.
 * Each marque only shifts temperature and adds a *trace* of its colour to the
 * rim — the paint carries the colour, never the room.
 */
const defs: Record<LookId, LookDef> = {
  // Porsche — cool, technical, graphite
  graphite: {
    bg: '#0c0d0f',
    panels: {
      top: ['#e9eef6', 5.2],
      sideL: ['#dce3ee', 3.8],
      sideR: ['#dce3ee', 2.8],
      rim: ['#aeb9cc', 2.2],
      fill: ['#3a4250', 1.1],
    },
    pool: ['#cdd6e4', 0.1],
  },
  // Ferrari — warm 2700K studio, a red trace in the rim only
  rosso: {
    bg: '#0f0b0a',
    panels: {
      top: ['#fff1e6', 4.4],
      sideL: ['#ffe2d2', 3.2],
      sideR: ['#ffe8dc', 2.6],
      rim: ['#ff6a4d', 1.9],
      fill: ['#3a2a25', 1.1],
    },
    pool: ['#ffd9c4', 0.1],
  },
  // Lamborghini — concrete: hard white top light, warm-grey bounce
  concrete: {
    bg: '#100f0e',
    panels: {
      top: ['#f4efe6', 6],
      sideL: ['#d9d2c6', 3],
      sideR: ['#d9d2c6', 2],
      rim: ['#bfb6a8', 2],
      fill: ['#3d3a35', 1.3],
    },
    pool: ['#e8dccb', 0.11],
  },
  // McLaren — dark industrial, a faint papaya edge
  industrial: {
    bg: '#0b0c0d',
    panels: {
      top: ['#e3e9f0', 4.4],
      sideL: ['#f2d2b6', 3],
      sideR: ['#e6ecf2', 3.2],
      rim: ['#ffab6b', 1.8],
      fill: ['#2c3138', 1],
    },
    pool: ['#f0dccb', 0.1],
  },
  // Aston Martin — tailored, green-black, soft (key held back: the silver paint blows out easily)
  tailored: {
    bg: '#0a0d0c',
    panels: {
      top: ['#eef2ec', 3.4],
      sideL: ['#cfd9d2', 2.4],
      sideR: ['#cfd9d2', 2.2],
      rim: ['#a7bcae', 1.9],
      fill: ['#2f3a34', 0.9],
    },
    pool: ['#cfe0d5', 0.09],
  },
  // Mercedes-AMG — steel (black paint: more light)
  steel: {
    bg: '#0c0c0d',
    panels: {
      top: ['#ffffff', 6],
      sideL: ['#e8eaee', 4.6],
      sideR: ['#e8eaee', 3.8],
      rim: ['#c9ced6', 3],
      fill: ['#3a3d42', 1.3],
    },
    pool: ['#e6e9ee', 0.1],
  },
}

export type Look = {
  bg: THREE.Color
  panels: Record<PanelName, { color: THREE.Color; intensity: number }>
  pool: { color: THREE.Color; intensity: number }
}

export const LOOKS = Object.fromEntries(
  Object.entries(defs).map(([id, d]) => [
    id,
    {
      bg: new THREE.Color(d.bg),
      panels: Object.fromEntries(
        Object.entries(d.panels).map(([k, [c, i]]) => [k, { color: new THREE.Color(c), intensity: i }]),
      ) as Look['panels'],
      pool: { color: new THREE.Color(d.pool[0]), intensity: d.pool[1] },
    },
  ]),
) as Record<LookId, Look>

export const PANELS: PanelName[] = ['top', 'sideL', 'sideR', 'rim', 'fill']
