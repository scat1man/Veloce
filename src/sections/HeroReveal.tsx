import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { ease } from '../animations/tokens'
import { Button } from '../components/Button'
import { SmartImage } from '../components/SmartImage'
import { images } from '../data/images'
import { vehicleById } from '../data/vehicles'
import { scrollToHash } from '../hooks/scrollTo'
import { holdScroll } from '../hooks/smoothScroll'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { useSite } from '../hooks/useSite'
import { stageUI, useStageUI } from '../three/store'

const VehicleViewer = lazy(() => import('../three/VehicleViewer'))

/** The car the site opens on. */
const HERO_ID = 'gt3-rs'
const SESSION_KEY = 'veloce:reveal-seen'
/** The whole reveal, start to curtain-up (ms). Never waits on the network. */
const INTRO_MS = 3200

const seen = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The home page's first screen. On a visitor's first view of the session a
 * three-second reveal plays over it (see Intro), then the curtain lifts on
 * the car in the studio with the headline beside it. Nothing waits for a
 * click; the reveal can still be skipped.
 */
export function HeroReveal() {
  const v = vehicleById(HERO_ID)!
  const reduce = useReducedMotion()
  const webgl = useStageUI((s) => s.webgl)
  const desktop = useIsDesktop()
  const { openBooking } = useSite()
  const [intro, setIntro] = useState(() => !reduce && !seen())

  // The navigation and scrolling wait for the reveal.
  useEffect(() => {
    stageUI.set({ intro: intro ? 'logo' : 'text' })
    if (!intro) {
      try {
        sessionStorage.setItem(SESSION_KEY, '1')
      } catch {
        /* private mode: the reveal simply plays again next visit */
      }
      return
    }
    holdScroll(true)
    return () => holdScroll(false)
  }, [intro])

  const specs: [string, string][] = [
    ['Power', v.specs.power],
    [v.specs.sprintLabel, v.specs.sprint],
    ['Top speed', v.specs.topSpeed],
    ['Collect in', v.location.split(',')[0]],
  ]

  return (
    <section id="top" data-nav-theme="dark" aria-label={`${v.manufacturer} ${v.name}`} className="relative h-svh min-h-[600px] overflow-hidden bg-ink text-bone">
      {/* The studio */}
      <div className="absolute inset-0">
        {webgl ? (
          <Suspense fallback={null}>
            <VehicleViewer
              modelId={v.model3d}
              holdDark={intro}
              framing={desktop ? { distance: 1.45, lookY: 1.7 } : { distance: 1.3, lookY: 0.45 }}
              className="absolute inset-0"
              renderFallback={() => <SmartImage image={v.image} priority sizes="100vw" className="h-full w-full" />}
            />
          </Suspense>
        ) : (
          <SmartImage image={v.image} priority sizes="100vw" className="h-full w-full" />
        )}
      </div>
      {/* Reading shade */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(11,11,12,0.9),transparent_50%),linear-gradient(to_bottom,rgba(11,11,12,0.6),transparent_30%)] lg:bg-[linear-gradient(to_right,rgba(11,11,12,0.8),transparent_45%),linear-gradient(to_top,rgba(11,11,12,0.85),transparent_22%)]"
      />

      {/* Headline and actions */}
      <motion.div
        className="gutter absolute inset-x-0 bottom-0 z-20 pb-10 lg:bottom-auto lg:top-[17svh] lg:pb-0"
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={intro ? { opacity: 0, y: 24 } : { opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: ease.out, delay: intro ? 0 : 0.35 }}
      >
        <p className="eyebrow text-stone">
          Performance car rental<span className="hidden sm:inline"> <span aria-hidden className="mx-2 text-bone/30">/</span> Five U.S. cities</span>
        </p>
        <h1 className="font-display text-display mt-4 max-w-[14ch]">Supercar rental, handled properly.</h1>
        <p className="text-lede mt-4 max-w-[32rem] text-stone">
          This week's car: the {v.manufacturer} {v.name}, delivered to your door in {v.location.split(',')[0]}.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button onClick={() => openBooking({ vehicleId: v.id })}>Book this car</Button>
          <Button
            variant="frame"
            href="#showroom"
            onClick={(e) => {
              e.preventDefault()
              scrollToHash('#showroom')
            }}
          >
            View the showroom
          </Button>
        </div>
      </motion.div>

      {/* Specification strip, like the sheet on a dealer's windscreen */}
      <motion.dl
        className="gutter absolute inset-x-0 bottom-0 z-20 hidden pb-9 md:grid md:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,12rem))_1fr]"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: intro ? 0 : 1 }}
        transition={{ duration: 0.8, delay: intro ? 0 : 0.6 }}
      >
        {specs.map(([k, val]) => (
          <div key={k} className="border-t border-bone/20 pr-6 pt-3">
            <dt className="eyebrow text-[0.6875rem] text-stone">{k}</dt>
            <dd className="font-display mt-1 text-[1.125rem] tracking-[-0.01em]">{val}</dd>
          </div>
        ))}
      </motion.dl>

      <AnimatePresence>{intro && <Intro key="intro" onDone={() => setIntro(false)} />}</AnimatePresence>
    </section>
  )
}

/**
 * Three seconds of suspense, then the site:
 *
 *   0.0s  black; a hairline of light draws across the middle
 *   0.7s  the line opens into a letterbox — the car's silhouette at sunset
 *   1.9s  the letterbox opens to full frame; maker and model are named
 *   2.6s  the curtain lifts on the home page
 *
 * Plays without input, never waits for loading, and any click or key skips it.
 */
function Intro({ onDone }: { onDone: () => void }) {
  const v = vehicleById(HERO_ID)!

  useEffect(() => {
    const t = setTimeout(onDone, INTRO_MS - 600)
    window.addEventListener('pointerdown', onDone)
    window.addEventListener('keydown', onDone)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', onDone)
      window.removeEventListener('keydown', onDone)
    }
  }, [onDone])

  return (
    <motion.div
      className="fixed inset-0 z-[80] overflow-hidden bg-black"
      exit={{ y: '-100%', transition: { duration: 0.75, ease: [0.76, 0, 0.24, 1] } }}
      role="presentation"
    >
      {/* The photograph, behind a letterbox that opens */}
      <motion.div
        className="absolute inset-0"
        initial={{ clipPath: 'inset(50% 0 50% 0)' }}
        animate={{ clipPath: ['inset(50% 0 50% 0)', 'inset(50% 0 50% 0)', 'inset(36% 0 36% 0)', 'inset(36% 0 36% 0)', 'inset(0% 0 0% 0)'] }}
        transition={{ duration: 2.4, times: [0, 0.2, 0.42, 0.72, 1], ease: [0.65, 0, 0.35, 1] }}
      >
        <motion.div className="absolute inset-0" initial={{ scale: 1.18 }} animate={{ scale: 1.04 }} transition={{ duration: 3.2, ease: ease.out }}>
          <SmartImage image={images.gt3Sunset} priority sizes="100vw" className="h-full w-full" />
        </motion.div>
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55))]" />
      </motion.div>

      {/* The hairline of light */}
      <motion.div
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-bone"
        style={{ boxShadow: '0 0 18px 2px rgba(255,236,200,0.65)' }}
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }}
        transition={{ duration: 1.0, times: [0, 0.65, 1], ease: [0.65, 0, 0.35, 1] }}
      />

      {/* The name */}
      <div className="gutter absolute inset-x-0 bottom-[12svh] text-center">
        <motion.p
          className="eyebrow text-bone/70"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.6, ease: ease.out }}
        >
          {v.manufacturer}
        </motion.p>
        <motion.p
          className="font-display mt-2 text-[clamp(2.25rem,6vw,4.5rem)] leading-none"
          initial={{ opacity: 0, y: 16, letterSpacing: '0.12em' }}
          animate={{ opacity: 1, y: 0, letterSpacing: '-0.01em' }}
          transition={{ duration: 0.9, delay: 1.75, ease: ease.out }}
        >
          {v.name}
        </motion.p>
      </div>

      <button type="button" onClick={onDone} className="label absolute bottom-6 right-6 text-bone/60 transition-colors hover:text-bone md:bottom-10 md:right-10">
        Skip
      </button>
    </motion.div>
  )
}
