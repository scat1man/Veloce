import { motion } from 'motion/react'
import { duration, ease } from '../animations/tokens'

type Props = { className?: string; animateIn?: boolean; delay?: number }

const letters = 'VELOCÉ'.split('')

/** The VELOCÉ wordmark. Letters can rise in individually on first load. */
export function Wordmark({ className = '', animateIn = false, delay = 0 }: Props) {
  return (
    <span
      role="img"
      aria-label="VELOCÉ"
      className={`font-wordmark -mr-[0.26em] inline-flex overflow-hidden pt-[0.25em] -mt-[0.25em] text-[0.9375rem] leading-none ${className}`}
    >
      {letters.map((l, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block"
          initial={animateIn ? { y: '130%' } : false}
          animate={{ y: '0%' }}
          transition={{ duration: duration.reveal, ease: ease.out, delay: delay + i * 0.045 }}
        >
          {l}
        </motion.span>
      ))}
    </span>
  )
}
