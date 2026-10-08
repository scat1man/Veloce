import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { getMyBookings, type BookingStatus, type BookingSummary } from '../api'
import { duration } from '../animations/tokens'
import { fadeUp, maskLine, stagger } from '../animations/variants'
import { noticeCopy, useAccount } from '../hooks/useAccount'
import { useSite } from '../hooks/useSite'
import { Button } from './Button'
import { GoogleButton } from './GoogleButton'

const statusLabel: Record<BookingStatus, string> = { pending: 'Received', confirmed: 'Confirmed', cancelled: 'Cancelled' }

const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** #account: sign in with Google, then see every request made with that email. */
export function AccountPanel({ titleId, onDone }: { titleId: string; onDone: () => void }) {
  const account = useAccount()
  const { openBooking } = useSite()
  const [bookings, setBookings] = useState<BookingSummary[] | null>(null)
  const [error, setError] = useState('')
  const user = account.user

  useEffect(() => {
    if (!user) return
    getMyBookings().then(setBookings, (err: Error) => setError(err.message))
  }, [user])

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

  if (!account.ready) return null

  if (!user) {
    return (
      <motion.div className="flex flex-1 flex-col" variants={stagger(0.05, 0.35)} initial="hidden" animate="show">
        {heading(['Your', 'account.'])}
        <motion.p variants={fadeUp} className="text-lede mt-4 max-w-sm text-ash">
          {account.google
            ? 'Sign in to see every request you have made, and book without typing your details again.'
            : 'Accounts are not available yet. You can still check a request with its reference and email.'}
        </motion.p>
        <motion.div variants={fadeUp} className="mt-auto flex flex-col gap-4 pt-10">
          {account.google ? (
            <GoogleButton returnTo="/#account" onBeforeLeave={account.clearNotice} />
          ) : (
            <Button href="#manage" variant="solid" size="lg" tone="onLight" className="w-full">
              Check a request
            </Button>
          )}
          <p className={`meta text-center ${account.notice ? 'text-ink' : 'text-ash'}`} role={account.notice ? 'alert' : undefined}>
            {account.notice ? noticeCopy[account.notice] : account.google ? 'We only use your name and email address.' : null}
          </p>
        </motion.div>
      </motion.div>
    )
  }

  const first = user.name.split(' ')[0]
  return (
    <motion.div className="flex flex-1 flex-col" variants={stagger(0.06, 0.35)} initial="hidden" animate="show">
      <motion.p variants={fadeUp} className="meta text-ash">
        {user.email}
      </motion.p>
      <div className="mt-5">{heading(first ? [`Hello,`, `${first}.`] : ['Your', 'requests.'])}</div>

      <AnimatePresence mode="wait">
        {bookings === null ? (
          <motion.p key="loading" className="meta mt-8 text-ash" exit={{ opacity: 0, transition: { duration: duration.ui } }}>
            {error || 'Loading your requests'}
          </motion.p>
        ) : bookings.length === 0 ? (
          <motion.p key="none" variants={fadeUp} initial="hidden" animate="show" className="text-lede mt-6 max-w-sm text-ash">
            No requests yet. When you book with {user.email}, it will appear here.
          </motion.p>
        ) : (
          <motion.ul key="list" className="mt-8 flex flex-col gap-3" variants={stagger(0.06)} initial="hidden" animate="show">
            {bookings.map((b) => (
              <motion.li key={b.reference} variants={fadeUp} className="rounded-[18px] bg-ink/[0.04] px-5 py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[1.0625rem] font-semibold tracking-[-0.015em]">{b.vehicle ?? 'Concierge to advise'}</p>
                  <p className={`meta shrink-0 ${b.status === 'cancelled' ? 'text-ash' : 'text-ink'}`}>{statusLabel[b.status]}</p>
                </div>
                <p className="mt-1 text-[0.9375rem] text-ash">
                  {b.city}, {fmtDate(b.pickup)} → {fmtDate(b.returnDate)}
                </p>
                <p className="meta mt-2 text-ash">{b.reference}</p>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <motion.div variants={fadeUp} className="mt-auto flex flex-col gap-4 pt-12">
        <Button
          variant="solid"
          size="lg"
          tone="onLight"
          className="w-full"
          onClick={() => {
            onDone()
            openBooking()
          }}
        >
          Book a drive
        </Button>
        <div className="flex flex-wrap justify-between gap-x-8 gap-y-2">
          <Button tone="onLight" variant="text" onClick={onDone}>
            Back to the site
          </Button>
          <Button tone="onLight" variant="text" onClick={() => account.signOut().catch((err: Error) => setError(err.message))}>
            Sign out
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
