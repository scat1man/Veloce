import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { imageWipe, type Direction } from './variants'

type Props = { children: ReactNode; className?: string; direction?: Direction; amount?: number }

/**
 * In-view image wipe.
 * The observed element stays unclipped — IntersectionObserver treats a target's own
 * clip-path as zero visible area — and an inner layer carries the wipe.
 */
export function RevealImage({ children, className = '', direction = 'up', amount = 0.25 }: Props) {
  return (
    <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, amount }}>
      <motion.div className="absolute inset-0" variants={imageWipe} custom={direction}>
        {children}
      </motion.div>
    </motion.div>
  )
}
