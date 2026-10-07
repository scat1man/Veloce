import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useRef } from 'react'
import { RevealText } from '../animations/RevealText'
import { viewport } from '../animations/tokens'
import { fadeUp, maskLine, stagger } from '../animations/variants'
import { SectionLabel } from '../components/SectionLabel'
import { SmartImage } from '../components/SmartImage'
import { experienceSteps, type ExperienceStep } from '../data/content'
import { images } from '../data/images'

/**
 * Service. Motion here is all masks and scroll:
 *   1. a pinned photograph opens from a framed inset to the full screen while
 *      the camera settles (scale 1.15 → 1), and one line arrives over it;
 *   2. three numbered spreads whose photographs unmask upward, scrubbed by
 *      scroll, with the type following a beat later.
 */
export function ExperienceSection() {
  return (
    <section id="experience" data-nav-theme="light" aria-labelledby="experience-title" className="border-t border-rule bg-paper text-ink">
      <div className="gutter grid-12 gap-y-6 pt-24 md:pt-32">
        <div className="col-span-12 lg:col-span-7">
          <SectionLabel label="Service" tone="onLight" />
          <RevealText as="h2" id="experience-title" className="font-display text-display mt-4" lines={['How a rental works.']} />
        </div>
      </div>

      <Cinema />

      <div className="gutter mt-16 flex flex-col gap-24 pb-24 md:mt-20 md:gap-32 md:pb-32">
        {experienceSteps.map((s, i) => (
          <Spread key={s.title} step={s} n={i + 1} flip={i % 2 === 1} />
        ))}
      </div>
    </section>
  )
}

/** The photograph opens out to the full screen as it is scrolled through. */
function Cinema() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] })
  const clip = useTransform(
    scrollYProgress,
    [0.15, 0.75],
    reduce ? ['inset(0% 0% 0% 0% round 0px)', 'inset(0% 0% 0% 0% round 0px)'] : ['inset(14% 12% 14% 12% round 28px)', 'inset(0% 0% 0% 0% round 0px)'],
  )
  const scale = useTransform(scrollYProgress, [0.15, 0.85], reduce ? [1, 1] : [1.15, 1])
  const line = useTransform(scrollYProgress, [0.72, 0.9], [0, 1])
  const lineY = useTransform(scrollYProgress, [0.72, 0.9], reduce ? [0, 0] : [24, 0])

  return (
    <div ref={ref} className="relative mt-16 h-[220svh] md:mt-20">
      <div className="sticky top-0 h-svh overflow-hidden">
        <motion.div className="absolute inset-0 overflow-hidden bg-ink" style={{ clipPath: clip }}>
          <motion.div className="absolute inset-0" style={{ scale }}>
            <SmartImage image={images.road} sizes="100vw" className="h-full w-full" />
          </motion.div>
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
          <motion.p
            className="font-display text-headline gutter absolute inset-x-0 bottom-[12svh] text-center text-bone"
            style={{ opacity: line, y: lineY }}
          >
            The road is yours.
          </motion.p>
        </motion.div>
      </div>
    </div>
  )
}

function Spread({ step, n, flip }: { step: ExperienceStep; n: number; flip: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  // Unmask upward as the spread enters, drift a little slower than the page throughout.
  const clip = useTransform(scrollYProgress, [0.05, 0.42], reduce ? ['inset(0% 0% 0% 0% round 20px)', 'inset(0% 0% 0% 0% round 20px)'] : ['inset(100% 0% 0% 0% round 20px)', 'inset(0% 0% 0% 0% round 20px)'])
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : ['-7%', '7%'])
  const scale = useTransform(scrollYProgress, [0.05, 0.5], reduce ? [1, 1] : [1.12, 1])

  return (
    <article ref={ref} className="grid-12 items-center gap-y-10" aria-label={step.title}>
      <motion.div
        className={`relative col-span-12 aspect-[4/5] overflow-hidden rounded-[20px] md:aspect-[16/11] lg:col-span-7 lg:aspect-[5/4] ${flip ? 'lg:col-start-6' : ''}`}
        style={{ clipPath: clip }}
      >
        <motion.div className="absolute inset-[-8%_0]" style={{ y, scale }}>
          <SmartImage image={images[step.imageKey]} sizes="(min-width: 1024px) 58vw, 100vw" className="h-full w-full" />
        </motion.div>
      </motion.div>

      <motion.div
        className={`col-span-12 md:col-span-8 lg:col-span-4 ${flip ? 'lg:col-start-1 lg:row-start-1' : 'lg:col-start-9'}`}
        variants={stagger(0.08, 0.15)}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
      >
        <motion.p variants={fadeUp} className="eyebrow flex items-center gap-3 text-ash">
          <span className="text-ink">{String(n).padStart(2, '0')}</span>
          <span aria-hidden className="h-px w-8 bg-ink/25" />
          {step.title.replace(/\.$/, '')}
        </motion.p>
        <div className="mt-5 overflow-hidden pb-[0.1em]">
          <motion.h3 variants={maskLine} className="font-display text-headline">
            {step.body}
          </motion.h3>
        </div>
        <motion.p variants={fadeUp} className="text-lede mt-3 max-w-[30rem] text-ash">
          {step.detail}
        </motion.p>
      </motion.div>
    </article>
  )
}
