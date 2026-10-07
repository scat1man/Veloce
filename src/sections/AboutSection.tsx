import { animate, motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Reveal } from '../animations/Reveal'
import { ease, viewport } from '../animations/tokens'
import { fadeUp, stagger } from '../animations/variants'
import { SectionLabel } from '../components/SectionLabel'
import { SmartImage } from '../components/SmartImage'
import { images } from '../data/images'
import { locations } from '../data/locations'
import { vehicles } from '../data/vehicles'

const hp = (s: string) => parseInt(s.replace(/[^\d]/g, ''), 10)
const strongest = vehicles.reduce((a, b) => (hp(b.specs.power) > hp(a.specs.power) ? b : a))

/** Every figure comes from the site's own data — nothing invented. */
const figures = [
  { value: vehicles.length, unit: 'cars', line: 'Each from a different marque.' },
  { value: locations.length, unit: 'cities', line: locations.map((l) => l.city).join(', ') + '.' },
  { value: hp(strongest.specs.power), unit: 'hp', line: `The ${strongest.manufacturer} ${strongest.name}, the most powerful car we keep.` },
  { value: 2, unit: 'hours', line: 'From your request to a call from your concierge.' },
]

/**
 * About. Calmer than the rest of the page: the statement fades up, the
 * photograph opens from its centre like a curtain, and the figures count up
 * once, left to right.
 */
export function AboutSection() {
  const reduce = useReducedMotion()
  return (
    <section id="about" data-nav-theme="dark" aria-labelledby="about-title" className="bg-ink text-bone">
      <div className="gutter pb-28 pt-28 md:pb-40 md:pt-40">
        <div className="mx-auto max-w-[62rem] text-center">
          <SectionLabel label="About VELOCÉ" />
          <Reveal delay={0.1}>
            <h2 id="about-title" className="font-display text-title mt-4 text-[clamp(1.75rem,3.2vw,3rem)] leading-[1.14]">
              A small collection of exceptional cars, kept in five American cities.{' '}
              <span className="text-stone">Delivered wherever you would like the drive to begin.</span>
            </h2>
          </Reveal>
        </div>

        <motion.div
          className="relative mt-16 aspect-[4/3] overflow-hidden rounded-[2px] md:mt-24 md:aspect-[21/9]"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.35 }}
        >
          <motion.div
            className="absolute inset-0"
            variants={{
              hidden: reduce ? {} : { clipPath: 'inset(0% 50% 0% 50%)', scale: 1.08 },
              show: { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, transition: { duration: 1.3, ease: ease.inOut } },
            }}
          >
            <SmartImage image={images.gt3Profile} sizes="100vw" className="h-full w-full" />
          </motion.div>
        </motion.div>

        <motion.dl
          className="mt-16 grid grid-cols-2 gap-x-6 gap-y-12 md:mt-24 lg:grid-cols-4"
          variants={stagger(0.12)}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
        >
          {figures.map((f) => (
            <motion.div key={f.unit} variants={fadeUp}>
              <dt className="flex items-baseline gap-1.5">
                <span className="font-display text-numeral">
                  <Count to={f.value} />
                </span>
                <span className="text-[1.0625rem] font-medium text-stone">{f.unit}</span>
              </dt>
              <dd className="mt-3 max-w-[18rem] text-[1rem] leading-[1.5] text-stone">{f.line}</dd>
            </motion.div>
          ))}
        </motion.dl>
      </div>
    </section>
  )
}

/** Counts up once, when the figure is first seen. Reduced motion: the final value. */
function Count({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReducedMotion()
  const format = (n: number) => Math.round(n).toLocaleString('en-US')
  const [text, setText] = useState(() => format(reduce ? to : 0))

  useEffect(() => {
    if (!inView) return
    if (reduce) {
      setText(format(to))
      return
    }
    const c = animate(0, to, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: (n) => setText(format(n)) })
    return () => c.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, to])

  return (
    <span ref={ref} className="tabular-nums">
      <span aria-hidden>{text}</span>
      <span className="sr-only">{format(to)}</span>
    </span>
  )
}
