import { motion } from 'motion/react'
import { fadeUp } from '../animations/variants'
import { viewport } from '../animations/tokens'

type Props = { label: string; className?: string; tone?: 'onDark' | 'onLight' }

/** The quiet line above a section title: "Experience". */
export function SectionLabel({ label, className = '', tone = 'onDark' }: Props) {
  return (
    <motion.p
      className={`text-[1.0625rem] font-semibold tracking-[-0.015em] ${tone === 'onDark' ? 'text-stone' : 'text-ash'} ${className}`}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
    >
      {label}
    </motion.p>
  )
}
