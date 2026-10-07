import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ease } from '../animations/tokens'
import { BrandLogo } from '../components/BrandLogo'
import { Button } from '../components/Button'
import { SmartImage } from '../components/SmartImage'
import { brands } from '../data/brands'
import { vehicleById } from '../data/vehicles'
import { scrollToHash } from '../hooks/scrollTo'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { useSite } from '../hooks/useSite'
import { stageUI, useStageUI } from '../three/store'

const VehicleViewer = lazy(() => import('../three/VehicleViewer'))

/** The car the site opens on. */
const HERO_ID = 'gt3-rs'

/**
 * The opening reveal, staged like a rare pack opening in a football game:
 *
 *   charge  — black; a beam of warm light rises from the floor
 *   marque  — the maker's mark, alone, glowing
 *   origin  — where it was built
 *   power   — the headline figure
 *   burst   — a flash, light rays, and the car is lit in the studio
 *   card    — its stat card slides in beside it
 *   done    — the page settles: headline, actions, the car turning slowly
 *
 * Plays once per session. Any click or key skips straight to the car;
 * reduced motion never plays it. "Replay" runs it again.
 */
type Phase = 'charge' | 'marque' | 'origin' | 'power' | 'burst' | 'card' | 'done'
const ORDER: Phase[] = ['charge', 'marque', 'origin', 'power', 'burst', 'card', 'done']
/** How long each phase holds before the next (ms). `power` also waits for the model. */
const HOLD: Record<Phase, number> = { charge: 1000, marque: 1200, origin: 1000, power: 1100, burst: 900, card: 1100, done: 0 }
const SESSION_KEY = 'veloce:reveal-seen'
const GOLD = '#d9b26a'

const seen = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

const at = (p: Phase, from: Phase) => ORDER.indexOf(p) >= ORDER.indexOf(from)

export function HeroReveal() {
  const v = vehicleById(HERO_ID)!
  const brand = brands[v.manufacturer]
  const reduce = useReducedMotion()
  const webgl = useStageUI((s) => s.webgl)
  const desktop = useIsDesktop()
  const { openBooking } = useSite()
  const [phase, setPhase] = useState<Phase>(() => (reduce || seen() ? 'done' : 'charge'))
  const [ready, setReady] = useState(false)
  const readyRef = useRef(false)
  const onReady = useCallback(() => {
    readyRef.current = true
    setReady(true)
  }, [])

  // The navigation waits for the reveal (it reads the shared intro flag).
  useEffect(() => {
    stageUI.set({ intro: phase === 'done' ? 'text' : 'logo' })
    if (phase === 'done') {
      try {
        sessionStorage.setItem(SESSION_KEY, '1')
      } catch {
        /* private mode: the reveal simply plays again next visit */
      }
    }
  }, [phase])

  // Step through the phases. `power` holds until the car has loaded (at most 6 s more).
  useEffect(() => {
    if (phase === 'done') return
    let waited = 0
    let t: ReturnType<typeof setTimeout>
    const next = () => setPhase(ORDER[ORDER.indexOf(phase) + 1])
    const tick = () => {
      if (phase === 'power' && webgl && !readyRef.current && waited < 6000) {
        waited += 250
        t = setTimeout(tick, 250)
      } else next()
    }
    t = setTimeout(tick, HOLD[phase])
    return () => clearTimeout(t)
  }, [phase, webgl])

  // Skip: any click or key during the reveal.
  useEffect(() => {
    if (phase === 'done') return
    const skip = () => setPhase('done')
    window.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', skip)
    return () => {
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', skip)
    }
  }, [phase])

  const lit = at(phase, 'burst')
  const intro = phase !== 'done'
  const [sprintLabel, sprint] = [v.specs.sprintLabel.replace(' mph', ''), v.specs.sprint.replace(' s', '')]
  const [drive, gearbox] = v.drivetrain.split(' · ')

  return (
    <section id="top" data-nav-theme="dark" aria-label={`${v.manufacturer} ${v.name}`} className="relative h-svh min-h-[600px] overflow-hidden bg-ink text-bone">
      {/* The studio: dark until the burst */}
      <div className="absolute inset-0">
        {webgl ? (
          <Suspense fallback={null}>
            <VehicleViewer
              modelId={v.model3d}
              holdDark={!lit}
              onReady={onReady}
              framing={desktop ? { distance: 1.3, lookY: 1.75 } : { distance: 1.05, lookY: 0.85 }}
              className="absolute inset-0"
              renderFallback={() => <SmartImage image={v.image} priority sizes="100vw" className="h-full w-full" />}
            />
          </Suspense>
        ) : (
          <motion.div className="absolute inset-0" initial={false} animate={{ opacity: lit ? 1 : 0 }} transition={{ duration: 0.8 }}>
            <SmartImage image={v.image} priority sizes="100vw" className="h-full w-full" />
          </motion.div>
        )}
      </div>
      {/* Reading shade for the settled copy */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(11,11,12,0.85),transparent_45%),linear-gradient(to_bottom,rgba(11,11,12,0.6),transparent_30%)] lg:bg-[linear-gradient(to_right,rgba(11,11,12,0.75),transparent_45%)]"
        initial={false}
        animate={{ opacity: intro ? 0 : 1 }}
        transition={{ duration: 0.8 }}
      />

      {/* ---- The pack opening ------------------------------------------- */}
      <AnimatePresence>
        {intro && (
          <motion.div key="intro" className="pointer-events-none absolute inset-0 z-10" exit={{ opacity: 0, transition: { duration: 0.6 } }} aria-hidden>
            {/* Black curtain until the burst */}
            <motion.div className="absolute inset-0 bg-black" initial={false} animate={{ opacity: lit ? 0 : 1 }} transition={{ duration: 0.25 }} />

            {/* Beam rising from the floor */}
            <motion.div
              className="absolute bottom-0 left-1/2 h-full w-[3px] -translate-x-1/2 origin-bottom"
              style={{ background: `linear-gradient(to top, ${GOLD}, rgba(217,178,106,0.25) 70%, transparent)` }}
              initial={{ scaleY: 0, opacity: 0 }}
              animate={lit ? { opacity: 0, scaleX: 40 } : { scaleY: 1, opacity: 1 }}
              transition={{ duration: lit ? 0.4 : 0.9, ease: ease.out }}
            />
            <motion.div
              className="absolute bottom-[-20%] left-1/2 h-[80%] w-[60vmin] -translate-x-1/2 rounded-[50%] blur-3xl"
              style={{ background: 'radial-gradient(closest-side, rgba(217,178,106,0.35), transparent)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: lit ? 0 : [0.4, 0.9, 0.4] }}
              transition={lit ? { duration: 0.3 } : { duration: 1.6, repeat: Infinity }}
            />

            {/* The clues, one at a time */}
            <div className="absolute inset-0 flex items-center justify-center text-center">
              <AnimatePresence mode="wait">
                {phase === 'marque' && (
                  <Clue key="marque">
                    <span style={{ filter: `drop-shadow(0 0 24px ${GOLD})` }}>
                      <BrandLogo manufacturer={v.manufacturer} size="clamp(3rem, 8vw, 6rem)" maxWidth="70vw" />
                    </span>
                  </Clue>
                )}
                {phase === 'origin' && brand && (
                  <Clue key="origin">
                    <span className="eyebrow block text-[0.875rem]" style={{ color: GOLD }}>
                      Built in
                    </span>
                    <span className="font-display mt-3 block text-[clamp(2.5rem,7vw,5.5rem)] leading-none" style={{ textShadow: `0 0 40px rgba(217,178,106,0.5)` }}>
                      {brand.origin}
                    </span>
                  </Clue>
                )}
                {phase === 'power' && (
                  <Clue key="power">
                    <span className="font-display block text-[clamp(4.5rem,16vw,12rem)] leading-none tabular-nums" style={{ textShadow: `0 0 60px rgba(217,178,106,0.6)` }}>
                      {v.specs.power.replace(' hp', '')}
                    </span>
                    <span className="eyebrow mt-3 block text-[0.875rem]" style={{ color: GOLD }}>
                      Horsepower
                    </span>
                  </Clue>
                )}
              </AnimatePresence>
            </div>

            {/* Burst: the flash and the rays */}
            {lit && (
              <>
                <motion.div
                  className="absolute inset-0"
                  style={{ background: `radial-gradient(circle at 50% 55%, #fff 0%, ${GOLD} 25%, transparent 70%)` }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.9, times: [0, 0.15, 1], ease: 'easeOut' }}
                />
                <motion.div
                  className="absolute left-1/2 top-[55%] h-[180vmax] w-[180vmax] -translate-x-1/2 -translate-y-1/2 mix-blend-screen"
                  style={{
                    background: 'repeating-conic-gradient(from 0deg, rgba(217,178,106,0.22) 0deg 4deg, transparent 4deg 15deg)',
                    maskImage: 'radial-gradient(circle, black 0%, transparent 45%)',
                    WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 45%)',
                  }}
                  initial={{ opacity: 0, rotate: 0, scale: 0.6 }}
                  animate={{ opacity: [0, 1, 0.5], rotate: 25, scale: 1 }}
                  transition={{ duration: 2.2, ease: ease.out }}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- The stat card ---------------------------------------------- */}
      <AnimatePresence>
        {at(phase, 'card') && (
          <motion.aside
            key="card"
            aria-label={`${v.manufacturer} ${v.name} figures`}
            className="absolute right-1/2 top-[10svh] z-20 origin-top translate-x-1/2 scale-[0.72] md:right-[6vw] md:top-1/2 md:translate-x-0 md:-translate-y-1/2 md:scale-100 md:origin-center"
            initial={reduce ? false : { opacity: 0, x: 60, rotateY: -35 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 0.8, ease: ease.out }}
            style={{ transformPerspective: 900 }}
          >
            <StatCard
              power={v.specs.power.replace(' hp', '')}
              name={v.name}
              manufacturer={v.manufacturer}
              stats={[
                ['HP', v.specs.power.replace(' hp', '')],
                [sprintLabel, sprint],
                ['TOP', v.specs.topSpeed.replace(' mph', '')],
                ['CC', v.specs.displacement.replace(' cc', '')],
                ['DRV', drive],
                ['GBX', gearbox?.replace('7-speed ', '') ?? ''],
              ]}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ---- Settled: the page itself ----------------------------------- */}
      <AnimatePresence>
        {!intro && (
          <motion.div
            key="copy"
            className="gutter absolute inset-x-0 bottom-0 z-20 pb-10 lg:bottom-auto lg:top-[17svh] lg:pb-0"
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: ease.out, delay: 0.1 }}
          >
            <p className="eyebrow text-stone">
              Performance car rental <span aria-hidden className="mx-2 text-bone/30">/</span> Five U.S. cities
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
              {!reduce && (
                <button type="button" onClick={() => setPhase('charge')} className="label ml-2 text-stone transition-colors hover:text-bone">
                  Replay reveal
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip */}
      {intro && (
        <button type="button" onClick={() => setPhase('done')} className="label absolute bottom-6 right-6 z-30 text-bone/60 transition-colors hover:text-bone md:bottom-10 md:right-10">
          Skip
        </button>
      )}
      {intro && <p className="sr-only" aria-live="polite">{ready ? 'Car loaded' : 'Loading'}</p>}
    </section>
  )
}

function Clue({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, filter: 'blur(12px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.08, filter: 'blur(6px)' }}
      transition={{ duration: 0.45, ease: ease.out }}
    >
      {children}
    </motion.div>
  )
}

/** A collectible-style card: shield outline, gold edge, one sheen sweep on arrival. */
function StatCard({ power, name, manufacturer, stats }: { power: string; name: string; manufacturer: string; stats: [string, string][] }) {
  const shape = 'polygon(8% 0, 92% 0, 100% 6%, 100% 88%, 50% 100%, 0 88%, 0 6%)'
  return (
    <div className="relative w-[15.5rem] md:w-[17rem]" style={{ clipPath: shape, background: GOLD, padding: 1 }}>
      <div className="relative overflow-hidden px-6 pb-12 pt-6" style={{ clipPath: shape, background: 'linear-gradient(160deg, #2b2519 0%, #141210 45%, #0b0b0c 100%)' }}>
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/2 -skew-x-12"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,236,190,0.28), transparent)' }}
          initial={{ left: '-60%' }}
          animate={{ left: '130%' }}
          transition={{ duration: 1.1, delay: 0.5, ease: 'easeInOut' }}
        />
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-[2.75rem] leading-none tabular-nums" style={{ color: GOLD }}>
              {power}
            </p>
            <p className="eyebrow mt-1" style={{ color: GOLD }}>
              HP
            </p>
          </div>
          <BrandLogo manufacturer={manufacturer} size="1.6rem" maxWidth="5.5rem" />
        </div>
        <div className="mt-5 border-y py-3 text-center" style={{ borderColor: 'rgba(217,178,106,0.35)' }}>
          <p className="eyebrow text-stone">{manufacturer}</p>
          <p className="font-display mt-1 text-[1.375rem] leading-tight">{name}</p>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2.5">
          {stats.map(([k, val]) => (
            <div key={k} className="flex items-baseline justify-between gap-2">
              <dt className="eyebrow text-[0.625rem] text-stone">{k}</dt>
              <dd className="font-display text-[1rem] tabular-nums">{val}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
