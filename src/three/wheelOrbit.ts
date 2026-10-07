import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

/**
 * Wheel sensitivity for Explore 3D: degrees of orbit per normalised wheel pixel.
 * One mouse notch ≈ 100 px ≈ 30°; a normal flick (3–4 notches, or one trackpad
 * swipe) ≈ 90–120°; three to four of those take you all the way round.
 */
export const WHEEL_DEG_PER_PX = 0.3
/** One wheel event never contributes more than this (stops a hard flick from spinning the car). */
const MAX_EVENT_PX = 160
/** How quickly the orbit catches up with the wheel (1/s). ~90 % within a quarter second. */
const CATCH_UP = 10

/** Wheel delta in pixels, whatever the device reports (pixels, lines or pages). */
function wheelPixels(e: WheelEvent) {
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  const px = e.deltaMode === 1 ? d * 33 : e.deltaMode === 2 ? d * window.innerHeight : d
  return Math.max(-MAX_EVENT_PX, Math.min(MAX_EVENT_PX, px))
}

/**
 * Scroll to orbit. Wheel/trackpad scrolling over `scope` turns the camera around
 * the car; ctrl+wheel (trackpad pinch) is left to OrbitControls for zoom.
 * The requested turn is eased in frame by frame (exponential, frame-rate independent),
 * so it stays smooth and settles quickly without lingering inertia. Dragging still works.
 */
export function useWheelOrbit(controls: RefObject<OrbitControlsImpl | null>, scope: () => HTMLElement | null, enabled = true) {
  const pending = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const onWheel = (e: WheelEvent) => {
      const el = scope()
      if (e.ctrlKey || !el || !el.contains(e.target as Node)) return
      e.preventDefault()
      e.stopImmediatePropagation() // keep OrbitControls from zooming as well
      pending.current += (wheelPixels(e) * WHEEL_DEG_PER_PX * Math.PI) / 180
    }
    // Capture on window so this runs before OrbitControls' own wheel listener.
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
  }, [enabled, scope])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c || Math.abs(pending.current) < 1e-4) return
    const step = pending.current * (1 - Math.exp(-CATCH_UP * Math.min(dt, 0.1)))
    pending.current -= step
    // Turn the camera about the orbit target directly. (setAzimuthalAngle would overwrite
    // the controls' damping delta and apply only a fraction of the step.)
    const p = c.object.position
    const x = p.x - c.target.x
    const z = p.z - c.target.z
    p.x = c.target.x + x * Math.cos(step) + z * Math.sin(step)
    p.z = c.target.z - x * Math.sin(step) + z * Math.cos(step)
    c.update()
  })
}
