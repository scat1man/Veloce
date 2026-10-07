import { motion, useReducedMotion, useTransform } from 'motion/react'
import { fadeUp, maskLine, stagger, withDelay } from '../../animations/variants'
import { Button } from '../../components/Button'
import { scrollToHash } from '../../hooks/scrollTo'
import { useSite } from '../../hooks/useSite'
import { actScreens } from './actScroll'
import { Chapter } from './Chapter'
import { HERO_LEN } from '../../three/timeline'
import { useStageUI } from '../../three/store'

const copyIn = withDelay(fadeUp, 0.7)

/**
 * The opening scene. The brand, not a car: a centred headline over a car that is
 * only drawn by its highlights, the camera drifting slowly in the dark.
 *
 *                      Drive the
 *                     exceptional.
 *         Six cars. Five cities. Delivered to your door.
 *              [Book a drive]   Explore the fleet ›
 *
 *                  [ the car, low-key, below ]
 *
 * On scroll the type lifts away faster than the car, and the light comes up.
 */
export function HeroChapter() {
  const reduce = useReducedMotion()
  const phase = useStageUI((st) => st.intro)
  const play = reduce || phase === 'text' ? 'show' : 'hidden'
  const r = (a: string, b: string) => (reduce ? [a, a] : [a, b])

  const yHead = useTransform(actScreens, [0, 1], r('0svh', '-14svh'))
  const yCopy = useTransform(actScreens, [0, 1], r('0svh', '-8svh'))
  const fade = useTransform(actScreens, [0, 0.45], [1, 0])
  // Scale, not blur: a scroll-linked blur on type this large repaints every frame and stutters.
  const scaleHead = useTransform(actScreens, [0, 0.6], reduce ? [1, 1] : [1, 0.96])
  const { openBooking } = useSite()

  return (
    <Chapter id="top" length={HERO_LEN} label="Introduction">
      {/* A soft pool of shade behind the type, so it holds over any highlight */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[58%] bg-[radial-gradient(60%_70%_at_50%_30%,rgba(10,10,11,0.75),transparent)]" />

      <div className="gutter relative flex h-full flex-col items-center pt-[17svh] text-center md:pt-[15svh]">
        <motion.h1
          className="font-display text-mega"
          style={{ y: yHead, opacity: fade, scale: scaleHead }}
          variants={stagger(0.1, 0.1)}
          initial="hidden"
          animate={play}
        >
          <span className="block overflow-hidden pb-[0.12em] -mb-[0.12em]">
            <motion.span className="block" variants={maskLine}>
              Drive the
            </motion.span>
          </span>
          <span className="block overflow-hidden pb-[0.12em] -mb-[0.12em]">
            <motion.span className="block" variants={maskLine}>
              exceptional.
            </motion.span>
          </span>
        </motion.h1>

        <motion.div className="flex flex-col items-center" style={{ y: yCopy, opacity: fade }}>
          <motion.p className="text-lede mt-6 max-w-[34rem] text-stone md:mt-8" variants={copyIn} initial="hidden" animate={play}>
            Six exceptional cars in five cities, delivered to your door.
          </motion.p>
          <motion.div
            className="pointer-events-auto mt-7 flex flex-wrap items-center justify-center gap-x-7 gap-y-3"
            variants={withDelay(fadeUp, 0.85)}
            initial="hidden"
            animate={play}
          >
            <Button onClick={() => openBooking()}>Book a drive</Button>
            <Button
              variant="text"
              href="#machines"
              onClick={(e) => {
                e.preventDefault()
                scrollToHash('#machines', { offset: window.innerHeight * 0.4 })
              }}
            >
              Explore the fleet
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </Chapter>
  )
}
