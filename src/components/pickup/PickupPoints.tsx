import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { duration, ease } from '../../animations/tokens'
import { Reveal } from '../../animations/Reveal'
import { locations } from '../../data/locations'
import { vehicles } from '../../data/vehicles'
import { useSite } from '../../hooks/useSite'
import { Button } from '../Button'
import { SmartImage } from '../SmartImage'
import { showInShowroom } from '../../sections/showroomLink'
import { PickupMap } from './PickupMap'

const carsIn = (city: string) => vehicles.filter((v) => v.location.split(',')[0] === city)

/**
 * Pickup points: the five hubs on a map. Choosing a pin (or a hub below the
 * map) flies to it and lists the cars kept there, each of which opens in the
 * Showroom.
 */
export function PickupPoints({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [failed, setFailed] = useState(false)
  const { openBooking } = useSite()
  const l = locations.find((x) => x.id === selectedId) ?? null
  const cars = l ? carsIn(l.city) : []

  return (
    <div className="mt-28 md:mt-40">
      <div className="max-w-[40rem]">
        <Reveal>
          <h3 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] tracking-[-0.03em]">Or collect it from us.</h3>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="text-lede mt-4 text-stone">Every car is kept at one of five hubs. Choose one to see what is parked there.</p>
        </Reveal>
      </div>

      <Reveal className="mt-10 md:mt-14" delay={0.12}>
        <div className="relative overflow-hidden rounded-[18px] bg-graphite">
          {!failed && <PickupMap selectedId={selectedId} onSelect={onSelect} onFail={() => setFailed(true)} className="h-[min(70vh,28rem)] w-full md:h-[min(72vh,40rem)]" />}
          {failed && (
            <p className="flex h-64 items-center justify-center px-6 text-center text-stone">The map could not load here. Choose a hub below instead.</p>
          )}

          {/* The chosen hub, over the map on wide screens */}
          <AnimatePresence>
            {l && (
              <motion.div
                key={l.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0, transition: { duration: duration.uiSlow, ease: ease.out } }}
                exit={{ opacity: 0, y: 8, transition: { duration: 0.2 } }}
                className="pointer-events-auto absolute bottom-4 left-4 z-10 hidden w-[22rem] rounded-[18px] bg-ink/85 p-5 backdrop-blur-md md:block"
                aria-live="polite"
              >
                <HubCard
                  hub={l.hub}
                  city={l.city}
                  state={l.state}
                  cars={cars}
                  onClose={() => onSelect(null)}
                  onBook={() => openBooking({ locationId: l.id })}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Reveal>

      {/* Hub chooser: works without the map, and is the card's home on phones */}
      <ul className="mt-6 flex flex-wrap gap-1" aria-label="Pickup hubs">
        {locations.map((x) => {
          const on = x.id === selectedId
          return (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => onSelect(on ? null : x.id)}
                aria-pressed={on}
                className={`label flex h-10 items-center rounded-full px-4 transition-colors duration-200 ${on ? 'bg-bone text-ink' : 'text-stone hover:text-bone'}`}
              >
                {x.city}
              </button>
            </li>
          )
        })}
      </ul>

      {l && (
        <div className="mt-6 md:hidden" aria-live="polite">
          <HubCard hub={l.hub} city={l.city} state={l.state} cars={cars} onClose={() => onSelect(null)} onBook={() => openBooking({ locationId: l.id })} />
        </div>
      )}

      <p className="sr-only">
        {locations.map((x) => `${x.hub}, ${x.city}: ${carsIn(x.city).length} cars.`).join(' ')}
      </p>
    </div>
  )
}

function HubCard({
  hub,
  city,
  state,
  cars,
  onClose,
  onBook,
}: {
  hub: string
  city: string
  state: string
  cars: typeof vehicles
  onClose: () => void
  onBook: () => void
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[1.25rem] font-semibold leading-tight tracking-[-0.02em] text-bone">{hub}</p>
          <p className="meta mt-1 text-stone">
            {city}, {state} · {cars.length} {cars.length === 1 ? 'car' : 'cars'} here
          </p>
        </div>
        <button type="button" onClick={onClose} className="label -mr-2 -mt-1 rounded-full px-3 py-2 text-stone hover:text-bone">
          All hubs
        </button>
      </div>

      <ul className="mt-4 space-y-1">
        {cars.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => showInShowroom({ city, carId: v.id })}
              className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-[12px] p-2 text-left transition-colors hover:bg-bone/[0.06]"
            >
              <span className="relative block h-12 w-16 shrink-0 overflow-hidden rounded-[8px] bg-carbon">
                <SmartImage image={v.image} sizes="64px" className="h-full w-full" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-medium tracking-[-0.01em] text-bone">{v.name}</span>
                <span className="meta block text-stone">{v.manufacturer}</span>
              </span>
              <ChevronRight aria-hidden className="size-4 text-stone transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-bone" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col items-start">
        <Button variant="text" onClick={onBook}>Book a pickup here</Button>
        <Button variant="text" onClick={() => showInShowroom({ city })}>
          {cars.length === 1 ? 'See it in the Showroom' : 'See them in the Showroom'}
        </Button>
      </div>
    </div>
  )
}
