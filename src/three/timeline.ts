import { models, type ModelId } from './models'

/**
 * The 3D act is one continuous scroll sequence measured in "screens"
 * (1 screen = 1 viewport height of scroll). DOM chapter heights and camera
 * keyframes both read from here, so copy and camera can never drift apart.
 *
 *   hero → one car chapter (the marques and the full collection follow below)
 *
 * Every car chapter has the same three beats, with its own choreography:
 *   brand   — the stage is dark; the manufacturer mark draws itself
 *   reveal  — lights rise, the camera walks around the car
 *   specs   — the camera settles on a technical view; the figures arrive
 */
export const ACT_CARS: ModelId[] = ['gt3-rs']

export const HERO_LEN = 1.4
/** The old six-marque interlude is gone; kept at 0 so the timeline maths stays in one place. */
export const MACHINES_LEN = 0
export const CAR_LEN = 2.5

/**
 * Beats inside a car chapter, in screens from its start. Tight on purpose:
 * the mark holds for about half a screen, the car is lit within one, and the
 * figures follow — no screen of scrolling without something to read.
 */
export const BEAT = {
  brandIn: 0.04,
  brandOut: 0.62,
  reveal: 0.7,
  specs: 1.7,
  handover: 2.22,
} as const

export const chapterStart = {
  hero: 0,
  machines: HERO_LEN,
  cars: HERO_LEN + MACHINES_LEN,
}

export const carStart = (i: number) => chapterStart.cars + i * CAR_LEN
export const ACT_LENGTH = chapterStart.cars + ACT_CARS.length * CAR_LEN

/** Which side of the frame the copy sits on in each car chapter (the car takes the other). */
export const copySide = (i: number): 'left' | 'right' => (i % 2 === 0 ? 'right' : 'left')

type V3 = [number, number, number]
export type Pose = { pos: V3; target: V3; fov: number }
type Key = Pose & { s: number }

/**
 * Orbit-style pose around the car (nose toward +Z).
 * az: 0 = front, 90 = right side, 180 = rear. `shift` > 0 pushes the car to the left of frame.
 */
function orbit(azDeg: number, height: number, dist: number, shift = 0, ty = 0.5, fov = 30): Pose {
  const a = (azDeg * Math.PI) / 180
  const right: V3 = [Math.cos(a), 0, -Math.sin(a)]
  return {
    pos: [Math.sin(a) * dist, height, Math.cos(a) * dist],
    target: [right[0] * shift, ty, right[2] * shift],
    fov,
  }
}

type Choreo = { intro: Pose; reveal: Pose; walk: Pose; specs: Pose }

/**
 * Per-car camera choreography — the same grammar, a different sentence each time.
 * `s` is the copy-side sign: +1 car framed left, -1 car framed right.
 */
const choreography: Record<ModelId, (s: number) => Choreo> = {
  // Porsche — precise: side profile, rear three-quarter, then a plan view.
  'gt3-rs': (s) => ({
    intro: orbit(70, 0.7, 16, 0),
    reveal: orbit(90, 1.2, 12.5, 1.75 * s),
    walk: orbit(140, 1.0, 11.5, 1.7 * s),
    specs: { pos: [0.3, 17, 0.3], target: [0, 0, 0], fov: 28 },
  }),
  // Ferrari — dramatic: front three-quarter, a sweeping side, low and close at the nose.
  sf90: (s) => ({
    intro: orbit(-40, 0.6, 16, 0),
    reveal: orbit(-48, 1.05, 11.5, 1.7 * s),
    walk: orbit(-100, 1.3, 12.5, 1.75 * s),
    specs: orbit(-12, 0.55, 11, 0, 0.6, 30),
  }),
  // Lamborghini — aggressive: ground-level front, then craning high overhead.
  revuelto: (s) => ({
    intro: orbit(20, 0.4, 15, 0),
    reveal: orbit(28, 0.42, 11.5, 1.7 * s, 0.55),
    walk: orbit(75, 2.6, 12, 1.7 * s),
    specs: orbit(45, 9.5, 8.5, 0, 0.2, 30),
  }),
  // McLaren — a lateral tracking shot, like a car-to-car rig.
  '750s': (s) => ({
    intro: orbit(-100, 0.8, 16, 0),
    reveal: orbit(-90, 0.95, 12.5, 1.75 * s),
    walk: orbit(-150, 1.6, 11.5, 1.7 * s),
    specs: orbit(180, 0.75, 11, 0, 0.6, 30),
  }),
  // Aston Martin — composed: a slow push from the front, then a long side elevation.
  db12: (s) => ({
    intro: orbit(0, 0.9, 17, 0),
    reveal: orbit(12, 1.0, 12, 1.7 * s),
    walk: orbit(58, 1.15, 11.5, 1.7 * s),
    specs: orbit(90, 1.0, 13.5, 0, 0.55, 28),
  }),
  // Mercedes-AMG — circles from the rear to the front, ends on a diagonal plan.
  'amg-gt': (s) => ({
    intro: orbit(-150, 0.8, 16, 0),
    reveal: orbit(-140, 1.05, 13.2, 1.85 * s),
    walk: orbit(-62, 1.2, 11.5, 1.75 * s),
    specs: orbit(-30, 12, 4.5, 0, 0, 28),
  }),
}

/**
 * Scroll → rotation sensitivity. Multiplies how far the camera travels around each
 * car between its reveal and walk-around poses (the scroll-driven orbit), so a
 * normal scroll through a chapter sees the car from front to rear.
 * 1 = the authored sweep (~50–80°); higher turns further for the same scroll.
 */
export const ORBIT_GAIN = 1.8

/** Turn a pose about the car (Y axis through the origin) by `a` radians. */
function turn(p: Pose, a: number): Pose {
  const r = (v: V3): V3 => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)]
  return { ...p, pos: r(p.pos), target: r(p.target) }
}
const azimuth = (v: V3) => Math.atan2(v[0], v[2])
/** Shortest signed angle from `a` to `b`. */
const delta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

const keys: Key[] = (() => {
  const k: Key[] = [
    // 01 hero — a low front three-quarter, the car centred in the lower half under the headline;
    // on scroll the camera drops to the flank and walks in.
    { s: 0, pos: [7.4, 0.62, 9.8], target: [0, 2.05, 0], fov: 27 },
    { s: 1.0, pos: [6.6, 0.6, 3.6], target: [0, 1.0, 0.2], fov: 30 },
  ]
  ACT_CARS.forEach((id, i) => {
    const s0 = carStart(i)
    // Camera paths are authored for a ~4.6 m car; longer cars get proportionally more room.
    const room = Math.max(1, models[id].length / 4.6)
    const fit = (p: Pose): Pose => ({
      ...p,
      pos: [p.pos[0] * room, p.pos[1] * (0.5 + 0.5 * room), p.pos[2] * room],
      target: [p.target[0] * room, p.target[1], p.target[2] * room],
    })
    const raw = choreography[id](copySide(i) === 'right' ? 1 : -1)
    const c = { ...raw, intro: fit(raw.intro), reveal: fit(raw.reveal), walk: fit(raw.walk), specs: fit(raw.specs) }
    // Widen the scroll-driven sweep around the car (see ORBIT_GAIN). The specification
    // view turns by the same amount, so the camera carries on from where the sweep ended
    // instead of swinging back.
    const extra = delta(azimuth(c.reveal.pos), azimuth(c.walk.pos)) * (ORBIT_GAIN - 1)
    c.walk = turn(c.walk, extra)
    c.specs = turn(c.specs, extra)
    k.push({ s: s0 + 0.15, ...c.intro })
    k.push({ s: s0 + BEAT.brandOut, ...c.intro, pos: [c.intro.pos[0] * 0.92, c.intro.pos[1], c.intro.pos[2] * 0.92] })
    k.push({ s: s0 + BEAT.reveal + 0.25, ...c.reveal })
    k.push({ s: s0 + BEAT.specs - 0.15, ...c.walk })
    k.push({ s: s0 + BEAT.specs + 0.35, ...c.specs })
    k.push({ s: s0 + BEAT.handover, ...c.specs, pos: [c.specs.pos[0] * 1.06, c.specs.pos[1] * 1.04, c.specs.pos[2] * 1.06] })
  })
  return k
})()

const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const mix3 = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
/**
 * Camera position between two poses, travelling *around* the car (angle, radius,
 * height) rather than in a straight line — a wide sweep never cuts close to the car.
 */
function orbitMix(a: V3, b: V3, t: number): V3 {
  const ang = azimuth(a) + delta(azimuth(a), azimuth(b)) * t
  const rad = mix(Math.hypot(a[0], a[2]), Math.hypot(b[0], b[2]), t)
  return [Math.sin(ang) * rad, mix(a[1], b[1], t), Math.cos(ang) * rad]
}

/**
 * Camera pose at scroll position `s`.
 * Portrait viewports centre the car and pull the camera back so it fits.
 * `snap` (reduced motion) returns the nearest keyframe instead of interpolating.
 */
export function poseAt(s: number, aspect: number, snap = false): Pose {
  let a = keys[0]
  let b = keys[keys.length - 1]
  if (s >= b.s) a = b
  else
    for (let i = 0; i < keys.length - 1; i++) {
      if (s >= keys[i].s && s <= keys[i + 1].s) {
        a = keys[i]
        b = keys[i + 1]
        break
      }
    }
  const raw = a === b ? 0 : clamp01((s - a.s) / (b.s - a.s))
  const t = snap ? (raw < 0.5 ? 0 : 1) : smooth(raw)
  let pos = orbitMix(a.pos, b.pos, t)
  let target = mix3(a.target, b.target, t)
  let fov = mix(a.fov, b.fov, t)

  if (aspect < 1.15) {
    // Portrait: centre the car, lift it into the upper part of the frame, back away.
    // Hero and "The machines": the type owns the upper frame — the car sits beneath it, closer.
    const hero = s < chapterStart.machines - 0.3
    const machines = !hero && s < chapterStart.cars - 0.2
    const k = hero ? Math.min(1.5, 1.15 / Math.max(aspect, 0.45)) : Math.min(1.9, 1.15 / Math.max(aspect, 0.45))
    const lift = hero ? (aspect < 0.6 ? -1.1 : -0.5) : machines ? (aspect < 0.6 ? -2.1 : -1.1) : 0.75
    target = [target[0] * 0.15, target[1] - lift, target[2] * 0.15]
    pos = [target[0] + (pos[0] - target[0]) * k, pos[1] * (0.9 + 0.1 * k), target[2] + (pos[2] - target[2]) * k]
    fov = fov + 6
  }
  return { pos, target, fov }
}

/** Index of the car chapter at `s` (-1 before the first). */
export function carIndexAt(s: number) {
  if (s < chapterStart.cars) return -1
  return Math.min(ACT_CARS.length - 1, Math.floor((s - chapterStart.cars) / CAR_LEN))
}

/** Lighting/model state at `s`. */
export function lookAt(s: number) {
  const i = carIndexAt(s)
  if (i < 0) {
    // Hero: low-key — the car is drawn by its highlights. Light rises as the visitor scrolls,
    // dims under the fleet title, then falls dark into the first chapter.
    let light = mix(0.34, 1, smooth(clamp01(s / 0.9)))
    if (s > 1.2) light = mix(1, 0.55, smooth(clamp01((s - 1.2) / 0.6)))
    if (s > chapterStart.cars - 0.45) light = mix(0.55, 0.02, smooth(clamp01((s - (chapterStart.cars - 0.45)) / 0.45)))
    return { light, model: ACT_CARS[0], index: -1, local: 0 }
  }
  const t = s - carStart(i)
  let light: number
  // Brand beat: the stage is essentially black — the mark comes first, the car after.
  if (t < BEAT.brandOut) light = 0.012
  else if (t < BEAT.reveal + 0.35) light = mix(0.012, 1, smooth((t - BEAT.brandOut) / (BEAT.reveal + 0.35 - BEAT.brandOut)))
  else if (t < BEAT.handover) light = 1
  else light = mix(1, 0.02, smooth(clamp01((t - BEAT.handover) / (CAR_LEN - BEAT.handover))))
  return { light, model: ACT_CARS[i], index: i, local: t }
}
