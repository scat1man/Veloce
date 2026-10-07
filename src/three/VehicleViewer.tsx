import { ContactShadows, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useReducedMotion } from 'motion/react'
import { easing } from 'maath'
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { LightRig, type RigState } from './LightRig'
import { Lens } from './Lens'
import { LOOKS } from './looks'
import { models, type ModelId } from './models'
import { CarModel, ModelBoundary } from './CarModel'
import { stage } from './store'
import { useWheelOrbit } from './wheelOrbit'

export type ViewerProps = {
  modelId: ModelId
  /** 'preview': slow camera drift + pointer parallax. 'interactive': drag to orbit, wheel to zoom. */
  mode?: 'preview' | 'interactive'
  /** Stop rendering (e.g. while another viewer is on top). */
  paused?: boolean
  className?: string
  /** Keep the studio dark (e.g. while a manufacturer mark plays over it). */
  holdDark?: boolean
  /** Shown instead of the canvas if this car's model fails to load. */
  renderFallback?: (id: ModelId) => ReactNode
  /** Optional DOM overlay (labels, hints). */
  children?: ReactNode
  /** Called once the first car has loaded and can be lit. */
  onReady?: () => void
  /** Preview framing: `distance` scales how far the camera sits; `lookY` raises the aim (the car sits lower). */
  framing?: { distance?: number; lookY?: number }
}

const TARGET = new THREE.Vector3(0, 0.85, 0)

/**
 * <VehicleViewer /> — a self-contained real-time studio for any car in models.ts.
 * Renders only while on screen; switching cars dips the studio lights, swaps the
 * model in the dark and brings the new studio up (no pop).
 */
export default function VehicleViewer({
  modelId,
  mode = 'preview',
  paused = false,
  holdDark = false,
  renderFallback,
  className = '',
  children,
  onReady,
  framing,
}: ViewerProps) {
  const [failed, setFailed] = useState<Partial<Record<ModelId, boolean>>>({})
  const wrap = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])
  const markReady = useCallback(() => {
    setReady(true)
    onReadyRef.current?.()
  }, [])
  const small = useMediaQuery('(max-width: 767px)')
  const [dpr, setDpr] = useState(small ? 1 : 1.5)
  const [lens, setLens] = useState(!small)

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '120px' })
    io.observe(wrap.current!)
    return () => io.disconnect()
  }, [])

  const running = visible && !paused

  return (
    <div ref={wrap} className={`overflow-hidden bg-ink ${className || 'relative'}`}>
      <Canvas
        dpr={[1, dpr]}
        frameloop={running ? 'always' : 'never'}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 28, near: 0.1, far: 80, position: [7, 1.6, 7] }}
        onCreated={({ gl }) => {
          gl.setClearColor('#000000', 0)
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.debug.checkShaderErrors = import.meta.env.DEV
        }}
        className={mode === 'interactive' ? 'cursor-grab active:cursor-grabbing' : ''}
      >
        <PerformanceMonitor
          onDecline={() => {
            setDpr(1)
            setLens(false)
          }}
        />
        <ViewerScene
          modelId={modelId}
          mode={mode}
          holdDark={holdDark}
          quality={small ? 'low' : 'high'}
          onReady={markReady}
          framing={framing}
          onFailed={(id) => setFailed((f) => ({ ...f, [id]: true }))}
        />
        {lens && <Lens />}
      </Canvas>

      {failed[modelId] && renderFallback && <div className="absolute inset-0">{renderFallback(modelId)}</div>}
      {!ready && !failed[modelId] && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="meta animate-pulse text-stone">Loading</p>
        </div>
      )}
      {children}
    </div>
  )
}

function ViewerScene({
  modelId,
  mode,
  holdDark,
  quality,
  onReady,
  onFailed,
  framing,
}: {
  framing?: ViewerProps['framing']
  modelId: ModelId
  mode: 'preview' | 'interactive'
  holdDark: boolean
  quality: 'high' | 'low'
  onReady: () => void
  onFailed: (id: ModelId) => void
}) {
  const reduce = !!useReducedMotion()
  const [shown, setShown] = useState<ModelId>(modelId)
  const [loaded, setLoaded] = useState<ModelId | null>(null)
  const light = useRef(0)
  const hover = useRef(0)
  const pending = useRef<ModelId | null>(null)
  const carGroup = useRef<THREE.Group>(null)
  // Nothing on stage while it is dark — the manufacturer mark owns the frame.
  useFrame(() => {
    if (carGroup.current) carGroup.current.visible = light.current > 0.06
  })
  const rig = useRef<RigState>({
    from: LOOKS[models[modelId].look],
    to: LOOKS[models[modelId].look],
    mix: 1,
    light: 0,
    hover: 0,
    pool: 1,
  })

  // Lights: fall while a swap is pending, rise once the shown model has loaded.
  const read = useCallback(
    (dt: number) => {
      const swapping = shown !== modelId
      const target = swapping || holdDark || loaded !== shown ? 0.02 : 1
      if (reduce) light.current = target
      else easing.damp(light, 'current', target, swapping ? 0.12 : 0.35, dt)
      if (swapping && light.current < 0.1 && pending.current !== modelId) {
        pending.current = modelId
        setShown(modelId)
      }
      const r = rig.current
      r.mix = Math.min(1, r.mix + dt * 2.5)
      r.light = light.current
      hover.current += (stage.hover - hover.current) * Math.min(1, dt * 4)
      r.hover = hover.current
      return r
    },
    [modelId, shown, loaded, reduce, holdDark],
  )

  // When the shown car changes, blend from the old studio to the new one.
  useEffect(() => {
    const r = rig.current
    const next = LOOKS[models[shown].look]
    if (r.to !== next) {
      r.from = r.to
      r.to = next
      r.mix = 0
    }
  }, [shown])

  const handleReady = useCallback(() => {
    setLoaded(shown)
    onReady()
  }, [shown, onReady])

  return (
    <>
      <LightRig read={read} quality={quality} />
      <ModelBoundary key={`b-${shown}`} id={shown} onError={onFailed} fallback={<Mark onMount={handleReady} />}>
        <group ref={carGroup}>
        <Suspense fallback={null}>
          <CarModel key={shown} id={shown} onReady={handleReady} />
          <ContactShadows
            key={`s-${shown}`}
            frames={6}
            position={[0, 0.004, 0]}
            scale={12}
            far={2}
            blur={2.8}
            opacity={1}
            resolution={quality === 'high' ? 1024 : 512}
            color="#000000"
          />
        </Suspense>
        </group>
      </ModelBoundary>
      {mode === 'interactive' ? <OrbitRig /> : <DriftRig reduce={reduce} distance={framing?.distance ?? 1} lookY={framing?.lookY ?? TARGET.y} />}
    </>
  )
}

function Mark({ onMount }: { onMount: () => void }) {
  useEffect(() => onMount(), [onMount])
  return null
}

/** Preview camera: a slow orbital drift (camera moves, car stays put) + pointer parallax. */
function DriftRig({ reduce, distance, lookY }: { reduce: boolean; distance: number; lookY: number }) {
  const { camera, pointer, size } = useThree()
  const t0 = useRef(0)
  const p = useRef(new THREE.Vector3())
  const aim = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 20)
    // A slow sway around the front three-quarter — never a continuous spin.
    if (!reduce) t0.current += dt
    // Fit the car's three-quarter silhouette (~4.8 m) to the frame width, whatever its shape.
    const dist = THREE.MathUtils.clamp(12 / (size.width / size.height), 8.2, 16) * distance
    const a = 0.72 + (reduce ? 0 : Math.sin(t0.current * 0.11) * 0.1 + pointer.x * 0.14)
    const h = 1.55 + (reduce ? 0 : pointer.y * 0.25)
    p.current.set(Math.sin(a) * dist, h, Math.cos(a) * dist)
    if (reduce) camera.position.copy(p.current)
    else easing.damp3(camera.position, p.current, 0.25, dt)
    camera.lookAt(aim.current.set(0, lookY, 0))
  })
  return null
}

/** Interactive camera: damped orbit, zoom, a slow idle turn until the visitor takes over. */
function OrbitRig() {
  const ref = useRef<OrbitControlsImpl>(null)
  const { camera, size, gl } = useThree()
  useWheelOrbit(ref, useCallback(() => gl.domElement, [gl]))
  const aspect = size.width / size.height
  const dist = THREE.MathUtils.clamp(11.5 / aspect, 7.6, 15)
  useEffect(() => {
    camera.position.set(Math.sin(0.78) * dist, 1.5, Math.cos(0.78) * dist)
    // Framing only on mount — afterwards the visitor owns the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      target={[0, 0.75, 0]}
      enablePan={false}
      enableDamping
      dampingFactor={0.07}
      rotateSpeed={0.55}
      zoomSpeed={0.6}
      minDistance={5}
      maxDistance={Math.max(13, dist + 1)}
      minPolarAngle={0.35}
      maxPolarAngle={Math.PI / 2 - 0.06}
    />
  )
}
