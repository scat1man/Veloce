import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { trackBookingStart } from '../analytics'
import { checkAvailability, createBooking } from '../api'
import { duration } from '../animations/tokens'
import { fadeUp, maskLine, stagger } from '../animations/variants'
import { locations } from '../data/locations'
import { vehicleById, vehicleLabel, vehicles } from '../data/vehicles'
import { useSite } from '../hooks/useSite'
import { Button } from './Button'
import { SideSheet } from './SideSheet'

/** "Book a drive" — an editorial side sheet (full screen on mobile). */
export function BookingPanel() {
  const { booking, closeBooking } = useSite()
  return createPortal(
    <AnimatePresence>
      {booking && <Sheet key="sheet" vehicleId={booking.vehicleId} locationId={booking.locationId} onClose={closeBooking} />}
    </AnimatePresence>,
    document.body,
  )
}

function Sheet({ vehicleId, locationId, onClose }: { vehicleId?: string; locationId?: string; onClose: () => void }) {
  return (
    <SideSheet label="Concierge" closeLabel="Close request form" titleId="booking-title" onClose={onClose}>
      <BookingForm vehicleId={vehicleId} locationId={locationId} onDone={onClose} autoFocus delay={0.35} titleId="booking-title" />
    </SideSheet>
  )
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return iso(d)
}
const nights = (a: string, b: string) => Math.max(1, Math.round((+new Date(b + 'T12:00:00') - +new Date(a + 'T12:00:00')) / 864e5))

type FormProps = {
  vehicleId?: string
  locationId?: string
  onDone?: () => void
  autoFocus?: boolean
  delay?: number
  titleId?: string
  /** Inline (in-page) variant omits the big heading — the section supplies its own. */
  inline?: boolean
}

/**
 * The concierge request: vehicle, city, pickup and return.
 * Saved by the backend (POST /api/bookings), which returns the reference.
 * A one-line summary keeps the choice concrete, and warns when the car is taken.
 */
export function BookingForm({ vehicleId, locationId, onDone, autoFocus, delay = 0, titleId, inline = false }: FormProps) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [vehicle, setVehicle] = useState(vehicleId ?? '')
  const [city, setCity] = useState(locationId ?? locations[0].id)
  const [today] = useState(() => iso(new Date()))
  const [pickup, setPickup] = useState(() => addDays(iso(new Date()), 7))
  const [ret, setRet] = useState(() => addDays(iso(new Date()), 9))
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  // Honeypot: invisible to people, so only bots fill it in. The server drops requests where it is set.
  const [website, setWebsite] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [available, setAvailable] = useState<boolean | null>(null)
  const firstId = useId()

  useEffect(() => {
    if (!autoFocus) return
    const t = setTimeout(() => document.getElementById(firstId)?.focus({ preventScroll: true }), 500)
    return () => clearTimeout(t)
  }, [autoFocus, firstId])

  const chosen = vehicleById(vehicle)
  const chosenCity = locations.find((l) => l.id === city)!
  const days = nights(pickup, ret)

  // Ask the server whether the chosen car is free on these dates. A short delay
  // avoids a request per keystroke; aborting drops answers for stale choices.
  useEffect(() => {
    setAvailable(null)
    if (!vehicle || ret <= pickup) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      checkAvailability(vehicle, pickup, ret, ctrl.signal).then(setAvailable, () => {})
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
    // `reference` changes after each booking, so the answer is refreshed for the next one.
  }, [vehicle, pickup, ret, reference])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    setError('')
    try {
      const booking = await createBooking({ vehicleId: vehicle || null, cityId: city, pickup, returnDate: ret, name, email, website })
      setReference(booking.reference)
      setStatus('sent')
    } catch (err) {
      setError((err as Error).message)
      setStatus('idle')
    }
  }

  return (
    <AnimatePresence mode="wait" initial={!inline}>
      {status !== 'sent' ? (
        <motion.form
          key="form"
          onSubmit={submit}
          // The first change to any field counts as starting a booking (analytics).
          onChangeCapture={trackBookingStart}
          className="flex flex-1 flex-col"
          variants={stagger(0.05, delay)}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, y: -12, transition: { duration: duration.ui } }}
        >
          {!inline && (
            <>
              <h2 id={titleId} className="font-display text-headline">
                <span className="block overflow-hidden pb-[0.1em] -mb-[0.1em]">
                  <motion.span variants={maskLine} className="block">
                    Book
                  </motion.span>
                </span>
                <span className="block overflow-hidden pb-[0.1em] -mb-[0.1em]">
                  <motion.span variants={maskLine} className="block">
                    a drive.
                  </motion.span>
                </span>
              </h2>
              <motion.p variants={fadeUp} className="text-lede mt-4 max-w-sm text-ash">
                Choose a car, a city and your dates. A concierge confirms within two hours.
              </motion.p>
            </>
          )}

          <div className={`grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 ${inline ? '' : 'mt-10'}`}>
            <Field label="Car" className="sm:col-span-2" id={firstId}>
              {(id) => (
                <Select id={id} value={vehicle} onChange={setVehicle}>
                  <option value="">No preference — advise me</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {vehicleLabel(v)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="City" className="sm:col-span-2">
              {(id) => (
                <Select id={id} value={city} onChange={setCity}>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.city}, {l.state}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Pick-up">
              {(id) => (
                <input
                  id={id}
                  type="date"
                  required
                  min={today}
                  value={pickup}
                  onChange={(e) => {
                    setPickup(e.target.value)
                    if (e.target.value >= ret) setRet(addDays(e.target.value, 1))
                  }}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Return">
              {(id) => (
                <input id={id} type="date" required min={addDays(pickup, 1)} value={ret} onChange={(e) => setRet(e.target.value)} className={inputClass} />
              )}
            </Field>
            <Field label="Name">
              {(id) => <input id={id} required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />}
            </Field>
            <Field label="Email">
              {(id) => <input id={id} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />}
            </Field>
          </div>

          <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>

          <motion.p variants={fadeUp} className="text-lede mt-8 text-ink" aria-live="polite">
            {chosen ? vehicleLabel(chosen) : 'Any car'}
            <span className="text-ash">
              {' '}
              in {chosenCity.city}, {days} {days === 1 ? 'day' : 'days'}.
            </span>
            {available === false && (
              <span className="mt-2 flex items-center gap-2 text-[0.9375rem] text-ink">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden />
                Already booked for these dates.
              </span>
            )}
          </motion.p>

          <motion.div variants={fadeUp} className="mt-auto flex flex-col gap-4 pt-6">
            <Button type="submit" variant="solid" size="lg" tone="onLight" className="w-full" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending request' : 'Request a drive'}
            </Button>
            <p className={`meta text-center ${error ? 'text-ink' : 'text-ash'}`} role={error ? 'alert' : undefined}>
              {error || 'No payment now. A concierge replies within two hours.'}
            </p>
          </motion.div>
        </motion.form>
      ) : (
        <motion.div key="sent" className="flex flex-1 flex-col" variants={stagger(0.08, 0.1)} initial="hidden" animate="show">
          <motion.p variants={fadeUp} className="meta text-ash">
            Reference {reference}
          </motion.p>
          <h2 id={titleId} className="font-display text-headline mt-5" aria-live="polite">
            <span className="block overflow-hidden pb-[0.1em] -mb-[0.1em]">
              <motion.span variants={maskLine} className="block">
                Request
              </motion.span>
            </span>
            <span className="block overflow-hidden pb-[0.1em] -mb-[0.1em]">
              <motion.span variants={maskLine} className="block">
                received.
              </motion.span>
            </span>
          </h2>
          <motion.p variants={fadeUp} className="text-lede mt-6 max-w-sm text-ash">
            Thank you{name ? `, ${name.split(' ')[0]}` : ''}. A concierge in {chosenCity.city} will be in touch within two hours.
          </motion.p>
          <motion.dl variants={fadeUp} className="mt-8 rounded-[18px] bg-ink/[0.04] px-5 py-2">
            {[
              ['Vehicle', chosen ? vehicleLabel(chosen) : 'Concierge to advise'],
              ['City', `${chosenCity.city}, ${chosenCity.state}`],
              ['Dates', `${fmtDate(pickup)} → ${fmtDate(ret)}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 py-3">
                <dt className="meta text-ash">{k}</dt>
                <dd className="text-right text-[0.9375rem]">{v}</dd>
              </div>
            ))}
          </motion.dl>
          <motion.p variants={fadeUp} className="meta mt-6 text-ash">
            Keep this reference.{' '}
            <a className="link-underline text-ink" href="#manage" onClick={() => onDone?.()}>
              Check its status
            </a>{' '}
            any time.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-auto pt-12">
            <Button
              tone="onLight"
              variant="text"
              onClick={() => (onDone ? onDone() : setStatus('idle'))}
            >
              {onDone ? 'Back to the site' : 'Make another request'}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const fmtDate = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export const inputClass =
  'h-14 w-full rounded-[12px] border border-ink/15 bg-white px-4 text-[1.0625rem] text-ink outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-ash/60 hover:border-ink/25 focus:border-ink focus:shadow-[0_0_0_1px_rgba(11,11,12,0.9)] focus-visible:outline-none'

export function Field({ label, children, className = '', id: fixedId }: { label: string; children: (id: string) => ReactNode; className?: string; id?: string }) {
  const auto = useId()
  const id = fixedId ?? auto
  return (
    <motion.div variants={fadeUp} className={className}>
      <label htmlFor={id} className="meta pl-1 text-ash">
        {label}
      </label>
      <div className="mt-1.5">{children(id)}</div>
    </motion.div>
  )
}

function Select({ id, value, onChange, children, ref }: { id: string; value: string; onChange: (v: string) => void; children: ReactNode; ref?: Ref<HTMLSelectElement> }) {
  return (
    <div className="relative">
      <select id={id} ref={ref} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} cursor-pointer appearance-none pr-10`}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ash" strokeWidth={1.5} />
    </div>
  )
}
