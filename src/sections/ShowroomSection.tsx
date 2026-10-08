import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RevealText } from '../animations/RevealText'
import { duration, ease, spring } from '../animations/tokens'
import { fadeUp, stagger } from '../animations/variants'
import { Reveal } from '../animations/Reveal'
import { SmartImage } from '../components/SmartImage'
import { VehicleDetail } from '../components/VehicleDetail'
import { vehicles, type Vehicle } from '../data/vehicles'
import { useStageUI } from '../three/store'
import { SHOWROOM_EVENT, type ShowroomRequest } from './showroomLink'

const cityOf = (v: Vehicle) => v.location.split(',')[0]

/** Each car's 3D view has its own address (#car/sf90), so it can be shared and Back closes it. */
const CAR_HASH = '#car/'
const carFromHash = () => {
  const id = window.location.hash.startsWith(CAR_HASH) ? window.location.hash.slice(CAR_HASH.length) : ''
  return vehicles.some((v) => v.id === id) ? id : null
}
const cities = [...new Set(vehicles.map(cityOf))]

/**
 * The Showroom — every car we keep, one photograph each, laid out like a
 * dealer's floor. Choosing a car opens it full screen in the 3D studio
 * (VehicleDetail), where the visitor can walk around it, read the
 * specification and book it. A city filter narrows the floor.
 */
export function ShowroomSection() {
  const [city, setCity] = useState<string | null>(null)
  const [openedId, setOpenedId] = useState<string | null>(carFromHash)
  const pushed = useRef(false)
  const webgl = useStageUI((st) => st.webgl)
  const shown = useMemo(() => (city ? vehicles.filter((v) => cityOf(v) === city) : vehicles), [city])
  const open = useCallback((id: string) => {
    setOpenedId(id)
    window.history.pushState(null, '', CAR_HASH + id)
    pushed.current = true
  }, [])
  const close = useCallback(() => {
    setOpenedId(null)
    if (!window.location.hash.startsWith(CAR_HASH)) return
    if (pushed.current) window.history.back()
    else window.history.replaceState(null, '', window.location.pathname + window.location.search)
    pushed.current = false
  }, [])

  // Back and Forward open and close the 3D view.
  useEffect(() => {
    const onPop = () => {
      pushed.current = false
      setOpenedId(carFromHash())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Other sections (the pickup map) can filter the floor to a city or open a car.
  useEffect(() => {
    const onRequest = (e: Event) => {
      const { city: c, carId } = (e as CustomEvent<ShowroomRequest>).detail
      if (c && cities.includes(c)) setCity(c)
      if (carId && vehicles.some((v) => v.id === carId)) open(carId)
    }
    window.addEventListener(SHOWROOM_EVENT, onRequest)
    return () => window.removeEventListener(SHOWROOM_EVENT, onRequest)
  }, [open])

  return (
    <section id="showroom" data-nav-theme="light" aria-labelledby="showroom-title" className="relative bg-paper text-ink">
      <div className="gutter pb-24 pt-24 md:pb-32 md:pt-32">
        <div className="max-w-[44rem]">
          <RevealText as="h2" id="showroom-title" className="font-display text-display" lines={['The Showroom.']} />
          <Reveal className="mt-5" delay={0.1}>
            <p className="text-lede text-ash">Six cars, each kept to factory specification and inspected before every drive. Open one to walk around it in 3D.</p>
          </Reveal>
        </div>

        {/* Floor filter */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 md:mt-16">
          <LayoutGroup id="showroom-filter">
            <ul className="-mx-5 flex flex-nowrap items-center gap-x-1 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0" aria-label="Filter by city">
              {[null, ...cities].map((c) => {
                const on = c === city
                return (
                  <li key={c ?? 'all'}>
                    <button
                      type="button"
                      onClick={() => setCity(c)}
                      aria-pressed={on}
                      className={`label relative flex h-10 shrink-0 items-center whitespace-nowrap rounded-full px-4 transition-colors duration-200 ${on ? 'text-bone' : 'text-ash hover:text-ink'}`}
                    >
                      {on && <motion.span aria-hidden layoutId="showroom-filter-on" className="absolute inset-0 rounded-full bg-ink" transition={spring.hover} />}
                      <span className="relative">{c ?? 'All locations'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </LayoutGroup>
          <p className="sr-only" aria-live="polite">
            {shown.length} {shown.length === 1 ? 'car' : 'cars'} {city ? `in ${city}` : 'across five cities'}
          </p>
        </div>

        {/* The floor */}
        <motion.ul
          className="mt-10 grid gap-x-6 gap-y-14 sm:grid-cols-2 md:mt-12 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-16"
          variants={stagger(0.07)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0, margin: "0px 0px -12% 0px" }}
        >
          {shown.map((v, i) => (
            <motion.li key={v.id} id={`showroom-${v.id}`} layout="position" variants={fadeUp} transition={{ layout: { duration: duration.uiSlow, ease: ease.inOut } }}>
              <Card v={v} webgl={webgl} onOpen={() => open(v.id)} eager={i < 3} />
            </motion.li>
          ))}
        </motion.ul>
      </div>

      {createPortal(
        <AnimatePresence>{openedId && <VehicleDetail key="detail" openedId={openedId} onClose={close} />}</AnimatePresence>,
        document.body,
      )}
    </section>
  )
}

function Card({ v, webgl, onOpen, eager }: { v: Vehicle; webgl: boolean; onOpen: () => void; eager: boolean }) {
  const figures: [string, string][] = [
    ['Power', v.specs.power],
    [v.specs.sprintLabel, v.specs.sprint],
    ['Top speed', v.specs.topSpeed],
  ]
  return (
    <button type="button" onClick={onOpen} className="group block w-full text-left" aria-label={`${v.manufacturer} ${v.name}: ${webgl ? 'view in 3D' : 'view details'}`}>
      <motion.div layoutId={`media-${v.id}`} transition={spring.layout} className="relative aspect-[4/3] overflow-hidden rounded-[18px] bg-carbon">
        <SmartImage
          image={v.image}
          priority={eager}
          sizes="(min-width: 1024px) 31vw, (min-width: 640px) 48vw, 100vw"
          className="h-full w-full transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.035]"
        />
        {webgl && (
          <span className="eyebrow absolute bottom-3 right-3 flex items-center gap-1.5 bg-ink/80 px-2.5 py-1.5 text-bone opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
            <Orbit /> 3D view
          </span>
        )}
      </motion.div>

      <div className="mt-5 flex items-baseline justify-between gap-4">
        <p className="eyebrow text-ash">{v.manufacturer}</p>
        <p className="meta text-ash">{cityOf(v)}</p>
      </div>
      <h3 className="font-display text-title mt-2">{v.name}</h3>

      <dl className="mt-3 grid grid-cols-3">
        {figures.map(([k, val]) => (
          <div key={k} className="pt-3">
            <dt className="text-[0.75rem] text-ash">{k}</dt>
            <dd className="font-display mt-1 text-[1.0625rem] tracking-[-0.01em] tabular-nums">{val}</dd>
          </div>
        ))}
      </dl>

      <span className="label mt-5 inline-flex items-center gap-1 text-ink">
        <span className="group-hover:underline group-hover:underline-offset-4">{webgl ? 'View in 3D' : 'View details'}</span>
        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} aria-hidden />
      </span>
    </button>
  )
}

/** A small orbit glyph: a ring with a direction tick. */
function Orbit() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <ellipse cx="8" cy="8" rx="6.5" ry="3" />
      <path d="M11.5 3.6 13.6 5 12 6.8" />
    </svg>
  )
}
