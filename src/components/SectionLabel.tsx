import { motion } from 'motion/react'
import { fadeUp } from '../animations/variants'
import { viewport } from '../animations/tokens'

type Props = { label: string; className?: string; tone?: 'onDark' | 'onLight' }

/** The small capitals above a section title: "THE SHOWROOM". */
export function SectionLabel({ label, className = '', tone = 'onDark' }: Props) {
  return (
    <motion.p
      className={`eyebrow ${tone === 'onDark' ? 'text-stone' : 'text-ash'} ${className}`}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
    >
      {label}
    </motion.p>
  )
}
