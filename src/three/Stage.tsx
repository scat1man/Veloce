import { PerformanceMonitor, useProgress } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { duration, ease } from '../animations/tokens'
import { holdScroll } from '../hooks/smoothScroll'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { CameraRig } from './CameraRig'
import { Cars } from './Scene'
import { stage, stageUI, useStageUI } from './store'
import { Studio } from './Studio'
import { Lens } from './Lens'

/**
 * The one WebGL canvas for the whole site. Fixed behind the 3D act; the DOM
 * chapters scroll over it. When the act is off screen the renderer stops.
 */
export default function Stage() {
  const active = useStageUI((s) => s.active)
  const exploring = useStageUI((s) => s.exploring)
  const reduce = !!useReducedMotion()
  const small = useMediaQuery('(max-width: 767px)')
  const quality = small ? 'low' : 'high'
  const [dpr, setDpr] = useState(small ? 1 : 1.5)
  // Post-processing is the first thing to go when the device struggles.
  const [lens, setLens] = useState(!small)

  // Sleep while the tab is hidden.
  const [hidden, setHidden] = useState(() => document.hidden)
  useEffect(() => {
    const on = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  // Pointer → normalised -1..1, read inside the render loop (no React renders).
  useEffect(() => {
    if (reduce) return
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      stage.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      stage.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [reduce])

  // Explore mode: freeze page scroll, Esc to leave.
  useEffect(() => {
    if (!exploring) return
    holdScroll(true)
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.dataset.exploring = 'true'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stageUI.set({ exploring: null })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      holdScroll(false)
      document.documentElement.style.overflow = ''
      delete document.documentElement.dataset.exploring
    }
  }, [exploring])

  return (
    <div className="fixed inset-0 z-0" aria-hidden={!exploring} style={{ visibility: active ? 'visible' : 'hidden' }}>
      <Canvas
        dpr={[1, dpr]}
        frameloop={active && !hidden ? 'always' : 'never'}
        eventSource={document.body}
        eventPrefix="client"
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 30, near: 0.1, far: 90, position: [6, 1.2, 7] }}
        onCreated={(state) => {
          const { gl } = state
          if (import.meta.env.DEV) (window as unknown as { __r3f: unknown }).__r3f = state
          // Clear render targets to *transparent* (contact shadows depend on it); the
          // visible backdrop comes from scene.background, so the canvas still reads opaque.
          gl.setClearColor('#000000', 0)
          // Shader error checking costs compile time; keep it for development only.
          gl.debug.checkShaderErrors = import.meta.env.DEV
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.outputColorSpace = THREE.SRGBColorSpace
        }}
      >
        <PerformanceMonitor
          onDecline={() => {
            setDpr(1)
            setLens(false)
          }}
          flipflops={2}
        />
        <CameraRig reduce={reduce} />
        <Studio quality={quality} />
        <Cars quality={quality} />
        {lens && <Lens />}
      </Canvas>

      <Loader />

      {createPortal(
      <AnimatePresence>
        {exploring && (
          <motion.div
            className="gutter pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex items-end justify-between pb-6 text-bone md:pb-10"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: duration.uiSlow, ease: ease.out }}
          >
            <p className="meta text-stone">Drag or scroll to orbit. Pinch to zoom. Esc to exit.</p>
            <button
              type="button"
              onClick={() => stageUI.set({ exploring: null })}
              className="label group pointer-events-auto flex h-11 items-center gap-3"
            >
              Exit
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bone/10 transition-colors duration-300 group-hover:bg-bone/20">
                <X className="h-4 w-4" strokeWidth={1.5} />
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </div>
  )
}

/** Reports load progress to the store; the intro (DOM) draws the loading line. */
function Loader() {
  const { progress } = useProgress()
  useEffect(() => {
    stageUI.set({ progress })
  }, [progress])
  return null
}
