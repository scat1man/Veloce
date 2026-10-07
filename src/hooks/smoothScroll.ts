import Lenis from 'lenis'
import { frame, cancelFrame } from 'motion/react'

/**
 * Site-wide smooth scrolling (Lenis). Wheel and trackpad input glide to rest
 * instead of jumping a notch at a time; touch keeps the phone's own native
 * momentum. It is driven from Motion's frame loop, so scroll-linked copy and
 * the WebGL camera read the same position in the same frame.
 * Visitors who ask for reduced motion get the browser's normal scrolling.
 */
let lenis: Lenis | null = null

export function startSmoothScroll() {
  if (lenis || typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  lenis = new Lenis({
    autoRaf: false,
    lerp: 0.085,
    wheelMultiplier: 0.9,
    // Anchor jumps (#showroom etc.) also glide.
    anchors: false,
  })
  const tick = ({ timestamp }: { timestamp: number }) => lenis?.raf(timestamp)
  frame.update(tick, true)
  return () => {
    cancelFrame(tick)
    lenis?.destroy()
    lenis = null
  }
}

export const smoothScroller = () => lenis

/** Pause/resume smooth scrolling (overlays, explore mode). Counted so overlays can stack. */
let holds = 0
export function holdScroll(on: boolean) {
  holds = Math.max(0, holds + (on ? 1 : -1))
  if (!lenis) return
  if (holds > 0) lenis.stop()
  else lenis.start()
}
