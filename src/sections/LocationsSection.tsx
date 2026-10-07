import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { RevealText } from '../animations/RevealText'
import { duration, ease, viewport } from '../animations/tokens'
import { fadeUp, maskLine, stagger } from '../animations/variants'
import { Button } from '../components/Button'
import { SmartImage } from '../components/SmartImage'
import { images, type ImageKey } from '../data/images'
import { locations, type Location } from '../data/locations'
import { useFinePointer, useIsDesktop } from '../hooks/useMediaQuery'
import { useSite } from '../hooks/useSite'

const cityImage: Record<string, ImageKey> = {
  la: 'cityLA',
  mia: 'cityMiami',
  las: 'cityVegas',
  nyc: 'cityNY',
  scottsdale: 'cityScottsdale',
}

function useNow(interval = 15_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), interval)
    return () => clearInterval(t)
  }, [interval])
  return now
}

const localTime = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(d)

/** Swaps a value with a short vertical mask. */
function Swap({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  return (
    <span className={`relative block overflow-hidden ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={id}
          className="block"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: duration.uiSlow, ease: ease.out }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/**
 * Locations. A city index set large — names rise out of their masks one after
 * another. Hovering, focusing or choosing a city wipes in its photograph, its
 * note and its details. On touch, a city opens in place.
 */
export function LocationsSection() {
  const desktop = useIsDesktop()
  const fine = useFinePointer()
  const [activeId, setActiveId] = useState(locations[0].id)
  const [openId, setOpenId] = useState<string | null>(null)
  const active = locations.find((l) => l.id === activeId)!
  const now = useNow()

  return (
    <section id="locations" data-nav-theme="dark" aria-labelledby="locations-title" className="bg-ink text-bone">
      <div className="gutter pb-28 pt-28 md:pb-40 md:pt-40">
        <RevealText as="h2" id="locations-title" className="font-display text-display" lines={['Five cities, delivered to your door.']} />

        <div className="grid-12 mt-14 gap-y-12 md:mt-20">
          {/* City index */}
          <motion.ul
            className="col-span-12 lg:col-span-6"
            variants={stagger(0.06)}
            initial="hidden"
            whileInView="show"
            viewport={viewport}
            aria-label="Cities"
          >
            {locations.map((l) => {
              const on = desktop ? l.id === activeId : l.id === openId
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => (desktop ? setActiveId(l.id) : setOpenId((o) => (o === l.id ? null : l.id)))}
                    onMouseEnter={desktop && fine ? () => setActiveId(l.id) : undefined}
                    onFocus={desktop ? () => setActiveId(l.id) : undefined}
                    aria-expanded={desktop ? undefined : on}
                    aria-controls={desktop ? 'city-preview' : `city-${l.id}`}
                    aria-current={desktop && on ? 'true' : undefined}
                    className="group grid min-h-[4.5rem] w-full grid-cols-[1fr_auto] items-center py-4 text-left md:py-5"
                  >
                    <span className="block overflow-hidden pb-[0.1em]">
                      <motion.span variants={maskLine} className="block">
                        <span
                          className={`font-display block text-[clamp(2.25rem,4.4vw,4rem)] leading-[1.05] tracking-[-0.035em] transition-[color,transform] duration-500 ease-[var(--ease-out-expo)] ${
                            on ? 'translate-x-3 text-bone' : 'text-bone/30 group-hover:translate-x-1.5 group-hover:text-bone/75'
                          }`}
                        >
                          {l.city}
                        </span>
                      </motion.span>
                    </span>
                    <motion.span variants={fadeUp} className="meta text-right text-stone">
                      {localTime(now, l.timeZone)}
                    </motion.span>
                  </button>

                  {/* Touch / narrow: the city opens in place */}
                  {!desktop && (
                    <AnimatePresence initial={false}>
                      {on && (
                        <motion.div
                          id={`city-${l.id}`}
                          key="panel"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: duration.uiSlow, ease: ease.inOut }}
                          className="overflow-hidden"
                        >
                          <div className="pb-8 pt-2">
                            <CityDetails l={l} compact />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </li>
              )
            })}
          </motion.ul>

          {/* Preview (desktop) */}
          {desktop && (
            <div id="city-preview" className="col-span-5 col-start-8" aria-live="polite">
              <div className="sticky top-24">
                <CityDetails l={active} />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function CityDetails({ l, compact = false }: { l: Location; compact?: boolean }) {
  const reduce = useReducedMotion()
  const { openBooking } = useSite()
  const image = images[cityImage[l.id]]
  return (
    <div>
      <div className={`relative overflow-hidden rounded-[18px] bg-carbon ${compact ? 'aspect-[16/10]' : 'aspect-[16/11]'}`}>
        <AnimatePresence initial={false}>
          <motion.div
            key={l.id}
            className="absolute inset-0"
            initial={reduce ? false : { clipPath: 'inset(0 0 100% 0)', scale: 1.03 }}
            animate={{ clipPath: 'inset(0 0 0% 0)', scale: 1, transition: { duration: duration.revealSlow, ease: ease.inOut } }}
            exit={{ opacity: 0, transition: { duration: duration.revealSlow } }}
          >
            <SmartImage image={image} sizes={compact ? '100vw' : '40vw'} className="h-full w-full" />
          </motion.div>
        </AnimatePresence>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/80 to-transparent" />
        <p className="label absolute bottom-4 left-4 text-bone md:bottom-5 md:left-5">
          <Swap id={`${l.id}-hub`}>{l.hub}</Swap>
        </p>
      </div>

      <p className="text-lede mt-6 max-w-[30rem] text-stone">
        <Swap id={`${l.id}-note`}>{l.note}</Swap>
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
        {[
          ['Our favourite road', l.route],
          ['Delivered within', l.radius],
        ].map(([k, val]) => (
          <div key={k}>
            <dt className="meta text-stone">{k}</dt>
            <dd className="mt-1 text-[1.0625rem] font-medium leading-snug tracking-[-0.015em]">
              <Swap id={`${l.id}-${k}`}>{val}</Swap>
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8">
        <Button variant="text" onClick={() => openBooking({ locationId: l.id })}>Drive in {l.city}</Button>
      </div>
    </div>
  )
}
