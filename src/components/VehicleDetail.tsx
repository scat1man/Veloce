import { AnimatePresence, motion, type PanInfo } from 'motion/react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { duration, ease, spring } from '../animations/tokens'
import { fadeUp, imageWipe, maskLine, stagger, type Direction } from '../animations/variants'
import { vehicleLabel, vehicles, type Vehicle } from '../data/vehicles'
import { useScrollLock } from '../hooks/useScrollLock'
import { useStageUI } from '../three/store'
import type { SiteImage } from '../data/images'

const VehicleViewer = lazy(() => import('../three/VehicleViewer'))
import { useSite } from '../hooks/useSite'
import { Button } from './Button'
import { SmartImage } from './SmartImage'
import { BrandLogo } from './BrandLogo'

type Props = {
  /** Vehicle whose card was clicked — owns the shared layout transition. */
  openedId: string
  onClose: (currentId: string) => void
}

const wrap = (i: number) => (i + vehicles.length) % vehicles.length

export function VehicleDetail({ openedId, onClose }: Props) {
  useScrollLock(true)
  const { openBooking, booking } = useSite()
  const [index, setIndex] = useState(() => vehicles.findIndex((v) => v.id === openedId))
  const [shot, setShot] = useState(0)
  const [dir, setDir] = useState<Direction>('left')
  // Once the visitor browses to another car, the stage no longer belongs to the original card.
  const [detached, setDetached] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const v = vehicles[index]
  const webgl = useStageUI((st) => st.webgl)
  type Tab = { label: string; kind: '3d' } | { label: string; kind: 'photo'; image: SiteImage }
  const tabs: Tab[] = [
    ...(webgl ? [{ label: '3D view', kind: '3d' as const }] : []),
    ...v.gallery.map((g) => ({ label: g.label, kind: 'photo' as const, image: g.image })),
  ]
  const tab = tabs[Math.min(shot, tabs.length - 1)]

  const go = useCallback((step: 1 | -1) => {
    setDir(step === 1 ? 'left' : 'right')
    setShot(0)
    setIndex((i) => wrap(i + step))
  }, [])

  const showShot = (i: number) => {
    if (i === shot) return
    setDir(i > shot ? 'left' : 'right')
    setShot(i)
  }

  const close = useCallback(() => {
    if (v.id !== openedId && !detached) {
      setDetached(true)
      requestAnimationFrame(() => onClose(v.id))
    } else onClose(v.id)
  }, [v.id, openedId, detached, onClose])

  // Keyboard: Esc closes, arrows browse. Ignored while the booking panel is on top.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (booking) return
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, go, booking])

  // Focus: move into the dialog, restore to the trigger afterwards.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const t = setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 300)
    return () => {
      clearTimeout(t)
      trigger?.focus?.({ preventScroll: true })
    }
  }, [])

  const onSwipe = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) go(1)
    else if (info.offset.x > 60 || info.velocity.x > 400) go(-1)
  }

  const prev = vehicles[wrap(index - 1)]
  const next = vehicles[wrap(index + 1)]

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vehicle-title"
      data-lenis-prevent
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain text-bone lg:overflow-hidden"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 24)}
    >
      <motion.div
        aria-hidden
        className="fixed inset-0 bg-ink"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.5, ease: ease.soft, delay: 0.1 } }}
        transition={{ duration: 0.5, ease: ease.soft }}
      />

      {/* Top rail */}
      <motion.div
        className={`gutter fixed inset-x-0 top-0 z-20 flex h-16 items-center justify-between transition-colors duration-300 lg:h-20 lg:bg-transparent ${
          scrolled ? 'bg-ink/90 backdrop-blur-md' : ''
        }`}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: duration.ui } }}
        transition={{ delay: 0.35, duration: duration.reveal, ease: ease.out }}
      >
        <p className="label text-stone" aria-live="polite">
          {v.manufacturer} {v.name}
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          className="label group -mr-2 flex h-11 items-center gap-3 px-2"
          aria-label="Close vehicle details"
        >
          Close
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bone/10 transition-colors duration-300 group-hover:bg-bone/20">
            <X className="h-4 w-4" strokeWidth={1.5} />
          </span>
        </button>
      </motion.div>

      <div className="relative grid min-h-full lg:h-full lg:grid-cols-12">
        {/* Stage */}
        <motion.div
          layoutId={detached ? undefined : `media-${openedId}`}
          transition={spring.layout}
          exit={detached ? { opacity: 0, transition: { duration: 0.4 } } : undefined}
          className="relative h-[58svh] overflow-hidden bg-carbon lg:col-span-7 lg:h-full"
        >
          {/* Real-time studio — stays mounted while browsing so cars swap inside it */}
          {webgl && (
            <Suspense fallback={null}>
              <VehicleViewer
                modelId={v.model3d}
                mode="interactive"
                paused={tab.kind !== '3d'}
                className="absolute inset-0"
                renderFallback={() => <SmartImage image={v.image} sizes="60vw" className="h-full w-full" />}
              />
            </Suspense>
          )}

          {/* Photography layers over the studio */}
          <motion.div
            className={`absolute inset-0 touch-pan-y ${tab.kind === '3d' ? 'pointer-events-none' : ''}`}
            drag={tab.kind === 'photo' ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.12}
            dragSnapToOrigin
            onDragEnd={onSwipe}
          >
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              {tab.kind === 'photo' && (
                <motion.div
                  key={`${v.id}-${shot}`}
                  custom={dir}
                  variants={imageWipe}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="absolute inset-0"
                >
                  <SmartImage image={tab.image} priority sizes="(min-width: 1024px) 60vw, 100vw" className="pointer-events-none h-full w-full" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent ${tab.kind === '3d' ? 'to-transparent' : 'to-ink/50'}`}
          />

          {/* Visual states */}
          <motion.div
            className="gutter pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 pb-5 lg:pb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: duration.ui } }}
            transition={{ delay: 0.5, duration: duration.reveal }}
          >
            <div className="pointer-events-auto flex gap-5 md:gap-8" role="tablist" aria-label="Views">
              {tabs.map((g, i) => (
                <button
                  key={g.label}
                  type="button"
                  role="tab"
                  aria-selected={i === shot}
                  onClick={() => showShot(i)}
                  className={`label group relative pb-3 pt-2 text-left transition-colors duration-300 ${
                    i === shot ? 'text-bone' : 'text-stone hover:text-bone'
                  }`}
                >
                  {g.label}
                  {i === shot && (
                    <motion.span layoutId="gallery-indicator" className="absolute inset-x-0 bottom-0 h-px bg-bone" transition={spring.hover} />
                  )}
                </button>
              ))}
            </div>
            <p className="meta hidden text-right text-stone md:block">
              {tab.kind === '3d' ? (
                <>
                  Drag or scroll to orbit
                </>
              ) : (
                <>Photograph: {tab.image.credit}</>
              )}
            </p>
          </motion.div>
        </motion.div>

        {/* Panel */}
        <motion.div
          data-lenis-prevent
          className="gutter relative flex flex-col pb-10 pt-8 lg:col-span-5 lg:h-full lg:overflow-y-auto lg:pt-28 xl:!px-14"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ delay: 0.25, duration: 0.4 }}
        >
          <AnimatePresence mode="wait" initial={true}>
            <VehicleInfo
              key={v.id}
              vehicle={v}
              onReserve={() => openBooking({ vehicleId: v.id })}
            />
          </AnimatePresence>

          <nav aria-label="Browse vehicles" className="mt-10 grid grid-cols-2 lg:mt-auto">
            <BrowseButton vehicle={prev} label="Previous" onClick={() => go(-1)} />
            <BrowseButton vehicle={next} label="Next" onClick={() => go(1)} align="right" />
          </nav>
        </motion.div>
      </div>
    </motion.div>
  )
}

function VehicleInfo({ vehicle: v, onReserve }: { vehicle: Vehicle; onReserve: () => void }) {
  const specs = [
    ['Engine', v.specs.engine],
    ['Displacement', v.specs.displacement],
    ['Power', v.specs.power],
    [v.specs.sprintLabel, v.specs.sprint],
    ['Top speed', v.specs.topSpeed],
    ['Drivetrain', v.drivetrain],
    ['Based in', v.location],
  ]
  return (
    <motion.div variants={stagger(0.05, 0.15)} initial="hidden" animate="show" exit="exit">
      <motion.div variants={fadeUp}>
        <BrandLogo manufacturer={v.manufacturer} size="1.9rem" maxWidth="10rem" />
      </motion.div>
      <h2 id="vehicle-title" className="font-display text-headline mt-6">
        <span className="block overflow-hidden pb-[0.1em] -mb-[0.1em]">
          <motion.span variants={maskLine} className="block">
            {v.name}
          </motion.span>
        </span>
        <span className="sr-only"> — {v.manufacturer}</span>
      </h2>
      <motion.p variants={fadeUp} className="text-lede mt-3 text-bone/90">
        {v.tagline}
      </motion.p>
      <motion.p variants={fadeUp} className="font-text mt-3 max-w-md text-[1rem] leading-[1.6] text-stone">
        {v.summary}
      </motion.p>

      <motion.div variants={fadeUp} className="mt-8">
        <p className="eyebrow text-stone">Specification</p>
        <dl className="mt-3">
          {specs.map(([k, val]) => (
            <div key={k} className="flex items-baseline justify-between gap-6 py-2">
              <dt className="text-[0.875rem] text-stone">{k}</dt>
              <dd className="text-right text-[0.9375rem] font-medium tracking-[-0.01em]">{val}</dd>
            </div>
          ))}
        </dl>
      </motion.div>
      <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-3">
        <Button onClick={onReserve}>Book this car</Button>
      </motion.div>
      <motion.p variants={fadeUp} className="meta mt-4 text-stone">
        Nothing is charged until a concierge confirms your dates.
      </motion.p>
    </motion.div>
  )
}

function BrowseButton({
  vehicle,
  label,
  onClick,
  align = 'left',
}: {
  vehicle: Vehicle
  label: string
  onClick: () => void
  align?: 'left' | 'right'
}) {
  const right = align === 'right'
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial="rest"
      whileHover="hover"
      whileFocus="hover"
      className={`group flex flex-col gap-2 py-5 ${right ? 'items-end pl-4 text-right' : 'items-start pr-4 text-left'}`}
      aria-label={`${label}: ${vehicleLabel(vehicle)}`}
    >
      <span className="meta flex items-center gap-2 text-stone">
        {!right && (
          <motion.span variants={{ rest: { x: 0 }, hover: { x: -4 } }} transition={spring.hover}>
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          </motion.span>
        )}
        {label}
        {right && (
          <motion.span variants={{ rest: { x: 0 }, hover: { x: 4 } }} transition={spring.hover}>
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </motion.span>
        )}
      </span>
      <span className="label text-bone/80 transition-colors duration-300 group-hover:text-bone">{vehicleLabel(vehicle)}</span>
    </motion.button>
  )
}
