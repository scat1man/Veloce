import { motionValue, useTransform, type MotionValue } from 'motion/react'

/**
 * Scroll position through the act, in screens — the same number the camera reads.
 * DOM chapters derive their opacity/drift from it so copy and camera stay locked.
 */
export const actScreens: MotionValue<number> = motionValue(0)

/** 0→1 between two scroll positions (screens), clamped. */
export function useRange(from: number, to: number) {
  return useTransform(actScreens, [from, to], [0, 1], { clamp: true })
}

/**
 * Visibility window: fades/rises in over [inStart, inEnd], holds, then out over [outStart, outEnd].
 */
export function useWindow(inStart: number, inEnd: number, outStart: number, outEnd: number, travel = 40) {
  const opacity = useTransform(actScreens, [inStart, inEnd, outStart, outEnd], [0, 1, 1, 0], { clamp: true })
  const y = useTransform(actScreens, [inStart, inEnd, outStart, outEnd], [travel, 0, 0, -travel], { clamp: true })
  return { opacity, y }
}
