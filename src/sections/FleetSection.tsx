import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { RevealText } from '../animations/RevealText'
import { duration, ease, spring } from '../animations/tokens'
import { fadeUp, stagger } from '../animations/variants'
import { BrandLogo } from '../components/BrandLogo'
import { Button } from '../components/Button'
import { SectionLabel } from '../components/SectionLabel'
import { SmartImage } from '../components/SmartImage'
import { VehicleDetail } from '../components/VehicleDetail'
import { vehicles } from '../data/vehicles'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { useSite } from '../hooks/useSite'
import { useStageUI } from '../three/store'

const VehicleViewer = lazy(() => import('../three/VehicleViewer'))

/** Length of the mark interlude between cars (ms). */
const MARK_MS = 1100

/**
 * The fleet, as a product line-up. One stage, one car at a time: choosing
 * another car dims the studio, plays the new marque in the dark (≈1 s), then
 * lights the new car. Desktop renders the real model; small screens get the
 * car's photograph in the same frame (no second WebGL context on a phone).
 * ←/→ step through the collection while the stage has focus.
 */
export function FleetSection() {
  const desktop = useIsDesktop()
  const webgl = useStageUI((st) => st.webgl)
  const reduce = useReducedMotion()
  const { openBooking } = useSite()
  const [selected, setSelected] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [interlude, setInterlude] = useState(false)
  const [openedId, setOpenedId] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // The stage opens out to full width as it arrives.
  const stageRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: stageRef, offset: ['start end', 'start 0.3'] })
  const clip = useTransform(scrollYProgress, [0, 1], reduce ? ['inset(0% 0% round 20px)', 'inset(0% 0% round 20px)'] : ['inset(0% 6% round 40px)', 'inset(0% 0% round 20px)'])

  const choose = useCallback(
    (i: number, d?: 1 | -1) => {
      const n = (i + vehicles.length) % vehicles.length
      if (n === selected) return
      setDir(d ?? (n > selected ? 1 : -1))
      setSelected(n)
      if (reduce) return
      setInterlude(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setInterlude(false), MARK_MS)
    },
    [selected, reduce],
  )
  useEffect(() => () => clearTimeout(timer.current), [])

  const close = useCallback((currentId: string) => {
    const i = vehicles.findIndex((v) => v.id === currentId)
    if (i >= 0) setSelected(i)
    setOpenedId(null)
  }, [])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      choose(selected + 1, 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      choose(selected - 1, -1)
    }
  }

  const v = vehicles[selected]
  const show3d = desktop && webgl

  return (
    <section id="fleet" data-nav-theme="dark" aria-labelledby="fleet-title" className="relative bg-graphite text-bone">
      <div className="gutter pb-24 pt-28 md:pb-36 md:pt-40">
        <div className="text-center">
          <SectionLabel label="The fleet" />
          <RevealText as="h2" id="fleet-title" className="font-display text-display mt-3" lines={['Choose your car.']} />
        </div>

        {/* ---- The stage ---------------------------------------------------- */}
        <motion.div ref={stageRef} className="mt-14 md:mt-20" style={{ clipPath: clip }}>
          <div
            role="region"
            aria-roledescription="carousel"
            aria-label="The collection"
            tabIndex={0}
            onKeyDown={onKey}
            className="relative overflow-hidden bg-ink"
          >
            <div className="relative aspect-[4/5] w-full sm:aspect-[16/10] lg:aspect-auto lg:h-[min(80svh,54rem)]">
              {show3d ? (
                <Suspense fallback={null}>
                  <VehicleViewer
                    modelId={v.model3d}
                    holdDark={interlude}
                    paused={!!openedId}
                    className="absolute inset-0"
                    renderFallback={() => <SmartImage image={v.image} sizes="100vw" className="h-full w-full" />}
                  />
                </Suspense>
              ) : (
                <AnimatePresence initial={false} custom={dir}>
                  <motion.div
                    key={v.id}
                    className="absolute inset-0"
                    custom={dir}
                    initial={reduce ? false : { clipPath: dir === 1 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)' }}
                    animate={{ clipPath: 'inset(0 0% 0 0%)', transition: { duration: duration.revealSlow, ease: ease.inOut } }}
                    exit={{ opacity: 0.4, transition: { duration: duration.revealSlow } }}
                  >
                    <SmartImage image={v.image} sizes="100vw" className="h-full w-full" />
                  </motion.div>
                </AnimatePresence>
              )}

              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-ink/90 via-ink/35 to-transparent" />

              {/* The marque, in the dark between cars */}
              <AnimatePresence>
                {interlude && show3d && (
                  <motion.div
                    key={v.id}
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transition: { delay: 0.15, duration: 0.5, ease: ease.out } }}
                    exit={{ opacity: 0, transition: { duration: 0.35, ease: ease.inOut } }}
                  >
                    <BrandLogo manufacturer={v.manufacturer} size="clamp(3rem, 5vw, 4.75rem)" maxWidth="60%" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Particulars */}
              <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={v.id}
                    className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"
                    variants={stagger(0.06, interlude ? 0.55 : 0)}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    aria-live="polite"
                  >
                    <motion.div variants={fadeUp}>
                      <BrandLogo manufacturer={v.manufacturer} size="1.6rem" maxWidth="8.5rem" />
                      <h3 className="font-display text-headline mt-4">
                        <span className="sr-only">{v.manufacturer} </span>
                        {v.name}
                      </h3>
                      <p className="text-lede mt-2 text-stone">
                        {v.specs.power}
                        <span aria-hidden className="mx-2 text-bone/25">·</span>
                        {v.specs.sprintLabel} in {v.specs.sprint}
                      </p>
                    </motion.div>
                    <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-x-7 gap-y-3">
                      <Button onClick={() => openBooking({ vehicleId: v.id })}>Book a drive</Button>
                      <Button variant="text" onClick={() => setOpenedId(v.id)}>
                        Explore
                      </Button>
                    </motion.div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ---- Selector: marque + model; the active one carries an indicator -- */}
        <motion.ol
          className="-mx-5 mt-4 flex snap-x scroll-px-5 gap-1 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-6 md:overflow-visible md:px-0"
          aria-label="Choose a vehicle"
          variants={stagger(0.05)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.6 }}
        >
          {vehicles.map((item, i) => {
            const on = i === selected
            return (
              <motion.li key={item.id} variants={fadeUp} className="shrink-0 snap-start">
                <button
                  type="button"
                  onClick={() => choose(i)}
                  aria-current={on ? 'true' : undefined}
                  aria-label={`${item.manufacturer} ${item.name}`}
                  className={`group relative flex h-full w-full min-w-[9.5rem] flex-col items-start gap-3 px-1 pb-4 pt-5 text-left transition-opacity duration-300 ${
                    on ? 'opacity-100' : 'opacity-45 hover:opacity-85'
                  }`}
                >
                  <span className="flex h-7 items-center transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:-translate-y-0.5">
                    <BrandLogo manufacturer={item.manufacturer} size="1.35rem" maxWidth="6.5rem" />
                  </span>
                  <span className="label whitespace-nowrap">{item.name}</span>
                  {on && <motion.span aria-hidden layoutId="fleet-active" className="absolute inset-x-1 top-0 h-px bg-bone" transition={spring.layout} />}
                </button>
              </motion.li>
            )
          })}
        </motion.ol>
      </div>

      {createPortal(
        <AnimatePresence>{openedId && <VehicleDetail key="detail" openedId={openedId} onClose={close} />}</AnimatePresence>,
        document.body,
      )}
    </section>
  )
}
