import { useSyncExternalStore } from 'react'
import type { ModelId } from './models'

/**
 * Shared state between the DOM and the WebGL stage.
 * High-frequency values (scroll, pointer) are plain mutable fields read inside
 * useFrame — they never trigger React renders. Low-frequency UI state
 * (explore mode, loading) goes through a tiny subscribable store.
 */
export const stage = {
  /** Scroll position through the 3D act, in viewport heights. */
  screens: 0,
  /** Normalised pointer, -1..1. */
  pointer: { x: 0, y: 0 },
  /** 0..1 when the pointer is over the car. */
  hover: 0,
  /** 0..1 intro reveal of the hero car (lights come up). */
  reveal: 0,
}

type UIState = {
  /** Model currently in free-orbit "explore" mode, or null. */
  exploring: ModelId | null
  /** Hero model has loaded and the reveal can play. */
  ready: boolean
  /** The act is on screen — otherwise the renderer sleeps. */
  active: boolean
  webgl: boolean
  /**
   * Opening sequence: 'logo' (black, manufacturer mark) → 'reveal' (car emerges)
   * → 'text' (copy arrives). Navigation and hero copy wait for it.
   */
  intro: 'logo' | 'reveal' | 'text'
  /** Models that failed to load — the DOM shows a quiet note instead of a car. */
  failed: Partial<Record<ModelId, boolean>>
  /** 0–100 load progress of the stage's first car (for the intro). */
  progress: number
}

// Reduced motion: no opening sequence — decided before the first render so the ident never flashes.
const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
let ui: UIState = { exploring: null, ready: false, active: true, webgl: true, intro: reducedMotion ? 'text' : 'logo', failed: {}, progress: 0 }
const listeners = new Set<() => void>()

export const stageUI = {
  get: () => ui,
  set(patch: Partial<UIState>) {
    ui = { ...ui, ...patch }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function useStageUI<T>(select: (s: UIState) => T): T {
  return useSyncExternalStore(stageUI.subscribe, () => select(ui), () => select(ui))
}

export function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
