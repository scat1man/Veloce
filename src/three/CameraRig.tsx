import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { easing } from 'maath'
import { useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { poseAt } from './timeline'
import { stage, stageUI, useStageUI } from './store'
import { useWheelOrbit } from './wheelOrbit'

const UP = new THREE.Vector3(0, 1, 0)
const p = new THREE.Vector3()
const t = new THREE.Vector3()
const right = new THREE.Vector3()
const dir = new THREE.Vector3()
const CAR_CENTRE = new THREE.Vector3(0, 0.55, 0)

const easeOut = (x: number) => 1 - Math.pow(1 - x, 4)
const page = () => document.body

/**
 * The commercial-camera: every value is a target that the real camera eases toward.
 *   scroll  → keyframed position / target / FOV (timeline.ts)
 *   pointer → small offset along the camera's own right/up axes
 *   load    → a slow dolly-in as the studio lights come up
 * Explore mode hands the camera to damped OrbitControls, then eases back.
 */
export function CameraRig({ reduce }: { reduce: boolean }) {
  const { camera, size } = useThree()
  const cam = camera as THREE.PerspectiveCamera
  const target = useRef(new THREE.Vector3())
  const fov = useRef(30)
  const primed = useRef(false)
  const ready = useStageUI((s) => s.ready)
  const intro = useStageUI((s) => s.intro)
  const exploring = useStageUI((s) => s.exploring)
  const controls = useRef<OrbitControlsImpl>(null)
  useWheelOrbit(controls, page, !!exploring)
  const clock = useRef(0)
  /** Rotate the camera position around the target (radians, about Y). */
  const yaw = (a: number) => {
    const dx = p.x - t.x
    const dz = p.z - t.z
    p.x = t.x + dx * Math.cos(a) - dz * Math.sin(a)
    p.z = t.z + dx * Math.sin(a) + dz * Math.cos(a)
  }

  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 20)

    // The car only emerges once its manufacturer mark has left the screen.
    if (ready && intro !== 'logo') stage.reveal = reduce ? 1 : Math.min(1, stage.reveal + dt / 3.4)
    if (intro === 'reveal' && stage.reveal > 0.42) stageUI.set({ intro: 'text' })
    const r = easeOut(stage.reveal)

    if (exploring) {
      // Ease the orbit pivot onto the car, and remember it for the hand-back.
      const c = controls.current
      if (c) {
        easing.damp3(c.target, CAR_CENTRE, 0.4, dt)
        target.current.copy(c.target)
      }
      return
    }

    const pose = poseAt(stage.screens, size.width / size.height, reduce)
    p.set(...pose.pos)
    t.set(...pose.target)

    // Intro: start further back, a little higher and a few degrees round the front
    // three-quarter; push in and settle as the light rises.
    dir.subVectors(p, t)
    p.addScaledVector(dir, (1 - r) * 0.42)
    p.y += (1 - r) * 0.35
    if (r < 1) yaw((1 - r) * 0.16)

    // Hero: a slow, continuous camera drift around the car — atmosphere, never a spin.
    const hero = Math.max(0, 1 - stage.screens / 1.2)
    if (!reduce && hero > 0) {
      clock.current += dt
      yaw(Math.sin(clock.current * 0.11) * 0.12 * hero)
      p.y += Math.sin(clock.current * 0.07) * 0.06 * hero
    }

    if (!reduce) {
      dir.subVectors(t, p).normalize()
      right.crossVectors(dir, UP).normalize()
      const d = p.distanceTo(t)
      const k = Math.min(1, d / 6) // gentler when close
      p.addScaledVector(right, stage.pointer.x * 0.24 * k)
      p.y += stage.pointer.y * 0.12 * k
    }

    if (!primed.current || reduce) {
      camera.position.copy(p)
      target.current.copy(t)
      fov.current = pose.fov
      primed.current = true
    } else {
      // Frame-rate independent damping. Scrolling is already smoothed (Lenis), so this
      // only needs to round off the keyframe corners, not hide scroll-wheel steps.
      easing.damp3(camera.position, p, 0.16, dt)
      easing.damp3(target.current, t, 0.16, dt)
      fov.current += (pose.fov - fov.current) * Math.min(1, dt * 3)
    }
    camera.lookAt(target.current)
    if (Math.abs(cam.fov - fov.current) > 0.001) {
      cam.fov = fov.current
      cam.updateProjectionMatrix()
    }
  })

  return exploring ? (
    <OrbitControls
      ref={controls}
      makeDefault
      // The canvas sits under the page, so input is read from the root element. Not <body>:
      // drag rotation is scaled by the element's height, and <body> is the whole page tall.
      domElement={document.documentElement}
      target={[0, 0.55, 0]}
      enablePan={false}
      enableDamping
      dampingFactor={0.07}
      rotateSpeed={0.55}
      zoomSpeed={0.6}
      minDistance={4.6}
      maxDistance={11}
      minPolarAngle={0.3}
      maxPolarAngle={Math.PI / 2 - 0.06}
    />
  ) : null
}
