import { motion, type HTMLMotionProps, type Variants } from 'motion/react'
import { useMemo } from 'react'
import { fadeUp, withDelay } from './variants'
import { viewport } from './tokens'

type Props = HTMLMotionProps<'div'> & {
  variants?: Variants
  delay?: number
  amount?: number
}

/** Generic in-view reveal wrapper (defaults to a short fade-up). */
export function Reveal({ variants = fadeUp, delay = 0, amount = viewport.amount, children, ...rest }: Props) {
  const v = useMemo(() => withDelay(variants, delay), [variants, delay])
  return (
    <motion.div variants={v} initial="hidden" whileInView="show" viewport={{ once: true, amount }} {...rest}>
      {children}
    </motion.div>
  )
}
