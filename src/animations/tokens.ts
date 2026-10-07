import type { Transition } from 'motion/react'

/** Easing curves — one vocabulary for the whole site. */
export const ease = {
  /** Default for reveals: fast start, long elegant settle. */
  out: [0.16, 1, 0.3, 1],
  /** Masks, wipes, model transitions — symmetrical and deliberate. */
  inOut: [0.65, 0, 0.35, 1],
  /** Hovers, toggles, UI fades. */
  soft: [0.2, 0, 0, 1],
} as const

/**
 * Durations in seconds — one scale: 120 · 200 · 400 · 600 · 700 ms.
 * Nothing in the page reveals slower than 700 ms; the site should feel fast.
 */
export const duration = {
  instant: 0.12,
  ui: 0.2,
  uiSlow: 0.4,
  reveal: 0.6,
  revealSlow: 0.7,
  hero: 0.7,
  image: 0.7,
} as const

/** Springs — damped so nothing bounces. */
export const spring = {
  hover: { type: 'spring', stiffness: 420, damping: 44, mass: 0.6 },
  layout: { type: 'spring', stiffness: 260, damping: 38, mass: 1 },
} satisfies Record<string, Transition>

/** Shared in-view config: reveal once, when a meaningful part is visible. */
export const viewport = { once: true, amount: 0.35 } as const
export const viewportEarly = { once: true, amount: 0.15 } as const
