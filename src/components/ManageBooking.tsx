import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { lookupBooking, type BookingStatus, type BookingSummary } from '../api'
import { duration } from '../animations/tokens'
import { fadeUp, maskLine, stagger } from '../animations/variants'
import { brand } from '../data/content'
import { Button } from './Button'
import { Field, inputClass } from './BookingPanel'

const statusCopy: Record<BookingStatus, { label: string; note: string }> = {
  pending: { label: 'Received', note: 'A concierge is reviewing your request and will be in touch shortly.' },
  confirmed: { label: 'Confirmed', note: 'Every detail is arranged. Your concierge will call the day before delivery.' },
  cancelled: { label: 'Cancelled', note: 'This request is no longer active. Make a new one whenever you like.' },
}

const fmtDate = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** "Manage a booking": a guest checks a request with its reference and their email. */
export function ManageBooking({ titleId, onDone }: { titleId: string; onDone: () => void }) {
  const [reference, setReference] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<BookingSummary | null>(null)
  const firstId = useId()

  useEffect(() => {
    const t = setTimeout(() => document.getElementById(firstId)?.focus({ preventScroll: true }), 500)
    return () => clearTimeout(t)
  }, [firstId])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError('')
    try {
      setResult(await lookupBooking(reference, email))
    } catch (err) {
      const status = (err as { status?: number }).status
      setError(status === 404 ? 'No request matches that reference and email. Check both and try again.' : (err as Error).message)
    } finally {
      setSending(false)
    }
  }

  const heading = (lines: string[]) => (
    <h2 id={titleId} className="font-display text-headline">
      {lines.map((l) => (
        <span key={l} className="block overflow-hidden pb-[0.1em] -mb-[0.1em]">
          <motion.span variants={maskLine} className="block">
            {l}
          </motion.span>
        </span>
      ))}
    </h2>
  )

  return (
    <AnimatePresence mode="wait">
      {!result ? (
        <motion.form
          key="form"
          onSubmit={submit}
          className="flex flex-1 flex-col"
          variants={stagger(0.05, 0.35)}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, y: -12, transition: { duration: duration.ui } }}
        >
          {heading(['Your', 'request.'])}
          <motion.p variants={fadeUp} className="text-lede mt-4 max-w-sm text-ash">
            Enter the reference from your confirmation and the email you used to see where things stand.
          </motion.p>

          <div className="mt-10 grid grid-cols-1 gap-y-5">
            <Field label="Reference" id={firstId}>
              {(id) => (
                <input
                  id={id}
                  required
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="VLC-XXXXX"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={20}
                  className={`${inputClass} uppercase placeholder:normal-case`}
                />
              )}
            </Field>
            <Field label="Email">
              {(id) => <input id={id} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />}
            </Field>
          </div>

          <motion.div variants={fadeUp} className="mt-auto flex flex-col gap-4 pt-10">
            <Button type="submit" variant="solid" size="lg" tone="onLight" className="w-full" disabled={sending}>
              {sending ? 'Checking' : 'Check status'}
            </Button>
            <p className={`meta text-center ${error ? 'text-ink' : 'text-ash'}`} role={error ? 'alert' : undefined}>
              {error || (
                <>
                  Lost your reference?{' '}
                  <a className="link-underline text-ink" href={`mailto:${brand.email}`}>
                    Email the concierge
                  </a>
                </>
              )}
            </p>
          </motion.div>
        </motion.form>
      ) : (
        <motion.div key="result" className="flex flex-1 flex-col" variants={stagger(0.08, 0.1)} initial="hidden" animate="show">
          <motion.p variants={fadeUp} className="meta text-ash">
            Reference {result.reference}
          </motion.p>
          <div className="mt-5" aria-live="polite">
            {heading([`${statusCopy[result.status].label}.`])}
          </div>
          <motion.p variants={fadeUp} className="mt-6 flex max-w-sm items-start gap-3 text-lede text-ash">
            <span
              className={`mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full ${result.status === 'cancelled' ? 'bg-ash' : 'bg-ink'}`}
              aria-hidden
            />
            {statusCopy[result.status].note}
          </motion.p>
          <motion.dl variants={fadeUp} className="mt-10 border-t border-ink/15">
            {[
              ['Vehicle', result.vehicle ?? 'Concierge to advise'],
              ['City', result.city],
              ['Dates', `${fmtDate(result.pickup)} → ${fmtDate(result.returnDate)}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 border-b border-ink/15 py-4">
                <dt className="meta text-ash">{k}</dt>
                <dd className="text-right text-[0.9375rem]">{v}</dd>
              </div>
            ))}
          </motion.dl>
          <motion.div variants={fadeUp} className="mt-auto flex flex-wrap gap-x-8 gap-y-2 pt-12">
            <Button tone="onLight" variant="text" onClick={onDone}>
              Back to the site
            </Button>
            <Button tone="onLight" variant="text" onClick={() => setResult(null)}>
              Check another
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
