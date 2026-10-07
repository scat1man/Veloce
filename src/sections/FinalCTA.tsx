import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useRef } from 'react'
import { viewport } from '../animations/tokens'
import { fadeUp, maskLine, stagger, withDelay } from '../animations/variants'
import { Button } from '../components/Button'
import { SmartImage } from '../components/SmartImage'
import { images } from '../data/images'
import { scrollToHash } from '../hooks/scrollTo'

/**
 * The closing shot before the booking form. The photograph settles from a slow
 * push-in as the section arrives, the veil lifts, the question rises, and only
 * then does the single action appear.
 */
export function FinalCTA() {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] })
  const scale = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 1.12, 1])
  const veil = useTransform(scrollYProgress, [0, 0.8], [0.8, 0.25])

  return (
    <section ref={ref} id="request" data-nav-theme="dark" aria-labelledby="cta-title" className="relative flex h-[105svh] min-h-[640px] flex-col overflow-hidden bg-ink text-bone">
      <motion.div className="absolute inset-0" style={{ scale }}>
        <SmartImage image={images.gt3Dusk} sizes="100vw" className="h-full w-full" />
      </motion.div>
      <motion.div aria-hidden className="absolute inset-0 bg-ink" style={{ opacity: veil }} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-ink/30" />

      <motion.div className="gutter relative pt-[15svh] text-center md:pt-[13svh]" variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={viewport}>
        <h2 id="cta-title" className="font-display text-mega">
          <span className="block overflow-hidden pb-[0.12em] -mb-[0.12em]">
            <motion.span variants={maskLine} className="block">
              Where to?
            </motion.span>
          </span>
        </h2>
        <motion.div variants={withDelay(fadeUp, 0.35)} className="mt-8 flex justify-center md:mt-10">
          <Button size="lg" href="#concierge" onClick={(e) => {
            e.preventDefault()
            scrollToHash('#concierge')
          }}>
            Book a drive
          </Button>
        </motion.div>
      </motion.div>
    </section>
  )
}
