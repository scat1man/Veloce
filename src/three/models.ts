import type { LookId } from './looks'

/**
 * 3D model manifest — the six real vehicles.
 *
 * `source` is the original file supplied in /public/models (kept untouched).
 * The browser loads `src`: a web copy of that source, Draco-compressed with
 * WebP textures (see /public/models/README.md for how each was produced).
 * `lite` is an optional lighter copy served to small screens.
 *
 * Every model is normalised at load time (CarModel.tsx): rotated so the nose
 * faces +Z, scaled so its robust length matches the real car, centred and
 * seated on the floor. Nothing is assumed about the source scale or origin.
 */
export type ModelId = 'gt3-rs' | 'sf90' | 'revuelto' | '750s' | 'db12' | 'amg-gt'

export type ModelSpec = {
  id: ModelId
  /** Original asset in /public/models, for reference. */
  source: string
  /** Web copy actually loaded. */
  src: string
  /** Lighter copy for small screens, when the full one is heavy. */
  lite?: string
  /** Real overall length in metres — the scale every model is normalised to. */
  length: number
  /** Rotation (radians) so the nose faces +Z. Measured per file. */
  rotationY: number
  /** Materials that get a clear-coat layer (the body paint). Matched on material name. */
  paint: RegExp
  /** Studio this car is shown in. */
  look: LookId
  credit: { title: string; author: string; license: string; url?: string }
}

export const models: Record<ModelId, ModelSpec> = {
  'gt3-rs': {
    id: 'gt3-rs',
    source: '/models/2023_porsche_911_gt3_rs.glb',
    src: '/models/web/porsche-911-gt3-rs.glb',
    length: 4.572,
    rotationY: Math.PI,
    paint: /^Coloured00(0|8)1Mat$/,
    look: 'graphite',
    credit: {
      title: '2023 Porsche 911 GT3 RS',
      author: 'Galaxy Car Showroom',
      license: 'CC BY 4.0',
      url: 'https://sketchfab.com/3d-models/2023-porsche-911-gt3-rs-421825bb75e448209a84cc4fdae30f28',
    },
  },
  sf90: {
    id: 'sf90',
    source: '/models/法拉利SF90 Stradale.glb',
    src: '/models/web/ferrari-sf90-stradale.glb',
    lite: '/models/web/lite/ferrari-sf90-stradale.glb',
    length: 4.71,
    rotationY: 0,
    paint: /^Body_Color$/,
    look: 'rosso',
    // The supplied file carries no author or licence metadata (it is a USDZ archive).
    credit: { title: 'Ferrari SF90 Stradale', author: 'Unknown', license: 'Licence not stated in source file' },
  },
  revuelto: {
    id: 'revuelto',
    source: '/models/free_lamborghini_revuelto.glb',
    src: '/models/web/lamborghini-revuelto.glb',
    length: 4.947,
    rotationY: 0,
    paint: /^Body$/,
    look: 'concrete',
    credit: {
      title: 'Free Lamborghini Revuelto',
      author: 'ALIEEEN',
      license: 'CC BY 4.0',
      url: 'https://sketchfab.com/3d-models/free-lamborghini-revuelto-cf52245eb68f48daa909c7ad2a8deaa3',
    },
  },
  '750s': {
    id: '750s',
    source: '/models/mc_laren_750s.glb',
    src: '/models/web/mclaren-750s.glb',
    length: 4.569,
    rotationY: 0,
    paint: /^McLaren$/,
    look: 'industrial',
    credit: {
      title: 'Mc Laren 750s',
      author: 'MistHars',
      license: 'CC BY 4.0',
      url: 'https://sketchfab.com/3d-models/mc-laren-750s-c863bfed41894b39bce6e3f7f1b7bc91',
    },
  },
  db12: {
    id: 'db12',
    source: '/models/2024_aston_martin_db12_volante.glb',
    src: '/models/web/aston-martin-db12-volante.glb',
    length: 4.725,
    rotationY: 0,
    paint: /^Paint$/,
    look: 'tailored',
    credit: {
      title: '2024 Aston Martin DB12 Volante',
      author: 'OUTPISTON',
      license: 'CC BY-NC-SA 4.0',
      url: 'https://sketchfab.com/3d-models/2024-aston-martin-db12-volante-18e282919eb9474ebf0644348d66329b',
    },
  },
  'amg-gt': {
    id: 'amg-gt',
    source: '/models/mercedes_amg_gt_63_rigged_model__free.glb',
    src: '/models/web/mercedes-amg-gt-63.glb',
    lite: '/models/web/lite/mercedes-amg-gt-63.glb',
    length: 5.054,
    rotationY: 0,
    paint: /^body$/,
    look: 'steel',
    credit: {
      title: 'Mercedes AMG GT 63 Rigged Model',
      author: 'ZRA Performance',
      license: 'CC BY 4.0',
      url: 'https://sketchfab.com/3d-models/mercedes-amg-gt-63-rigged-model-free-cc714a318b9a47b29fb6c498bdf0d9fe',
    },
  },
}

export const DRACO_PATH = '/models/draco/'

/** The file to load on this device. */
export function modelUrl(spec: ModelSpec, small: boolean) {
  return small && spec.lite ? spec.lite : spec.src
}

export const isSmallScreen = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
