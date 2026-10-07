import { Environment } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PANELS, type Look, type PanelName } from './looks'

/**
 * Floor effects live on their own layer: the camera sees them, but the
 * contact-shadow depth pass (default layer only) does not.
 */
export const FX_LAYER = 1

export type RigState = {
  from: Look
  to: Look
  /** 0 → `from`, 1 → `to`. */
  mix: number
  /** Overall stage brightness, 0..1. */
  light: number
  /** 0..1 pointer-over-car response. */
  hover: number
  /** Multiplier for the floor pool (lets the Ferrari's red rise early). */
  pool: number
}

const tmp = new THREE.Color()
const tmpB = new THREE.Color()

/**
 * The shared studio: five softbox panels inside <Environment> (reflections only —
 * the look that sells car paint), a flat backdrop and a soft floor light pool.
 * `read` is called every frame, so callers drive it from scroll or local state
 * without React re-renders.
 */
export function LightRig({ read, quality }: { read: (dt: number) => RigState; quality: 'high' | 'low' }) {
  const { scene, gl, camera } = useThree()
  const panels = useRef<Partial<Record<PanelName, THREE.MeshBasicMaterial | null>>>({})
  const pool = useRef<THREE.MeshBasicMaterial>(null)
  const bg = useMemo(() => new THREE.Color(), [])

  useEffect(() => {
    camera.layers.enable(FX_LAYER)
  }, [camera])

  const poolTex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grd.addColorStop(0, 'rgba(255,255,255,0.9)')
    grd.addColorStop(0.45, 'rgba(255,255,255,0.25)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(c)
    return t
  }, [])
  useEffect(() => () => poolTex.dispose(), [poolTex])

  useFrame((_, dt) => {
    const s = read(dt)
    const { from, to, mix, light, hover } = s

    // No floor: in the dark beats the backdrop is true black (a near-black floor bands into rings under the vignette).
    bg.copy(from.bg).lerp(to.bg, mix).multiplyScalar(Math.min(1, light * 1.24))
    scene.background = bg

    for (const name of PANELS) {
      const m = panels.current[name]
      if (!m) continue
      const a = from.panels[name]
      const b = to.panels[name]
      const intensity = a.intensity + (b.intensity - a.intensity) * mix
      // Hover: the key light breathes up a touch — a lighting response, not an effect.
      const boost = name === 'top' || name === 'sideL' ? 1 + hover * 0.35 : 1
      m.color.copy(tmp.copy(a.color).lerp(b.color, mix)).multiplyScalar(intensity * boost)
    }
    // No brightness floor: at light 0 the studio is genuinely black.
    scene.environmentIntensity = 0.02 + light * 1.28
    gl.toneMappingExposure = 0.1 + light * 1.05

    if (pool.current) {
      const strength = (from.pool.intensity + (to.pool.intensity - from.pool.intensity) * mix) * s.pool * Math.min(1, Math.max(0, light * 1.45 - 0.05))
      pool.current.color.copy(tmpB.copy(from.pool.color).lerp(to.pool.color, mix)).multiplyScalar(strength)
    }
  })

  const reg = (name: PanelName) => (m: THREE.MeshBasicMaterial | null) => {
    panels.current[name] = m
  }

  return (
    <>
      <Environment resolution={quality === 'high' ? 512 : 128} frames={Infinity} background={false}>
        {/* overhead softbox */}
        <mesh position={[0, 7, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[9, 2.6, 1]}>
          <planeGeometry />
          <meshBasicMaterial ref={reg('top')} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        {/* long raking strips — the horizontal highlights along the flanks */}
        <mesh position={[-6.5, 1.6, 0]} rotation={[0, Math.PI / 2, 0]} scale={[14, 0.55, 1]}>
          <planeGeometry />
          <meshBasicMaterial ref={reg('sideL')} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[6.5, 2.4, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[14, 0.4, 1]}>
          <planeGeometry />
          <meshBasicMaterial ref={reg('sideR')} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        {/* rim from behind */}
        <mesh position={[0, 2.2, -8]} scale={[10, 1.4, 1]}>
          <planeGeometry />
          <meshBasicMaterial ref={reg('rim')} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        {/* low front fill */}
        <mesh position={[0, 0.8, 8]} rotation={[0, Math.PI, 0]} scale={[12, 2.2, 1]}>
          <planeGeometry />
          <meshBasicMaterial ref={reg('fill')} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </Environment>

      {/* No floor plane: a flat backdrop makes an infinite cove, grounded by the
          contact shadow and this soft pool of light. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, -0.4]} renderOrder={3} onUpdate={(o) => o.layers.set(FX_LAYER)}>
        <planeGeometry args={[16, 12]} />
        <meshBasicMaterial ref={pool} map={poolTex} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </>
  )
}
