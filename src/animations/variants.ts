import type { Variants } from 'motion/react'
import { duration, ease } from './tokens'

/** Line of type rising out of a clipping mask. Parent must clip (overflow-hidden). */
export const maskLine: Variants = {
  hidden: { y: '108%' },
  show: { y: '0%', transition: { duration: duration.revealSlow, ease: ease.out } },
  exit: { y: '-108%', transition: { duration: duration.uiSlow, ease: ease.inOut } },
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: duration.reveal, ease: ease.out } },
  exit: { opacity: 0, y: -10, transition: { duration: duration.ui, ease: ease.soft } },
}

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: duration.reveal, ease: ease.soft } },
  exit: { opacity: 0, transition: { duration: duration.ui, ease: ease.soft } },
}

/** Container that only orchestrates timing for its children. */
export const stagger = (each = 0.08, delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: each, delayChildren } },
  exit: { transition: { staggerChildren: each / 2, staggerDirection: -1 } },
})

export type Direction = 'up' | 'down' | 'left' | 'right'

const hiddenInset: Record<Direction, string> = {
  up: 'inset(100% 0% 0% 0%)',
  down: 'inset(0% 0% 100% 0%)',
  left: 'inset(0% 0% 0% 100%)',
  right: 'inset(0% 100% 0% 0%)',
}
const exitInset: Record<Direction, string> = {
  up: 'inset(0% 0% 100% 0%)',
  down: 'inset(100% 0% 0% 0%)',
  left: 'inset(0% 100% 0% 0%)',
  right: 'inset(0% 0% 0% 100%)',
}

/**
 * Image wipe. Direction is where the image travels *from*.
 * Use with `custom={direction}` so AnimatePresence exits stay coherent.
 */
export const imageWipe: Variants = {
  hidden: (dir: Direction = 'up') => ({ clipPath: hiddenInset[dir], scale: 1.03 }),
  show: {
    clipPath: 'inset(0% 0% 0% 0%)',
    scale: 1,
    transition: {
      clipPath: { duration: duration.revealSlow, ease: ease.inOut },
      scale: { duration: duration.image, ease: ease.out },
    },
  },
  exit: (dir: Direction = 'up') => ({
    clipPath: exitInset[dir],
    scale: 1.02,
    transition: { duration: duration.reveal, ease: ease.inOut },
  }),
}

/** Variant transitions win over the `transition` prop, so delays are merged into the variant itself. */
export function withDelay(variants: Variants, delay: number): Variants {
  const show = variants.show
  if (!delay || typeof show !== 'object' || show === null) return variants
  return { ...variants, show: { ...show, transition: { ...(show.transition ?? {}), delay } } }
}
