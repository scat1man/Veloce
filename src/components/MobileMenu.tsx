import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { duration, ease } from '../animations/tokens'
import { maskLine, stagger, fadeUp } from '../animations/variants'
import { brand, guestLinks, navLinks, socialLinks } from '../data/content'
import { locations } from '../data/locations'
import { scrollToHash } from '../hooks/scrollTo'
import { useAccount } from '../hooks/useAccount'
import { useScrollLock } from '../hooks/useScrollLock'
import { useSite } from '../hooks/useSite'
import { Button } from './Button'

const socials = socialLinks.filter((s) => s.url)

type Props = { open: boolean; onClose: () => void }

/**
 * Full-screen navigation for < lg.
 * The panel wipes down like a curtain; links rise from masks, one after another.
 */
export function MobileMenu({ open, onClose }: Props) {
  useScrollLock(open)
  const { openBooking } = useSite()
  const account = useAccount()
  const firstLink = useRef<HTMLAnchorElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  // Move focus in, keep it in (Tab / Shift+Tab cycle inside the sheet), give it back on close.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const t = setTimeout(() => firstLink.current?.focus({ preventScroll: true }), 320)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panel.current) return
      const toggle = document.querySelector<HTMLElement>('[aria-controls="mobile-menu"]')
      const items = [
        ...(toggle ? [toggle] : []),
        ...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ]
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      opener?.focus?.({ preventScroll: true })
    }
  }, [open])

  const navigate = (href: string) => {
    onClose()
    // Let the scroll lock release before travelling.
    setTimeout(() => scrollToHash(href), 80)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="mobile-menu"
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="fixed inset-0 z-30 flex flex-col bg-ink text-bone lg:hidden"
          initial={{ clipPath: 'inset(0% 0% 100% 0%)' }}
          animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
          exit={{ clipPath: 'inset(0% 0% 100% 0%)', transition: { duration: duration.uiSlow, ease: ease.inOut, delay: 0.05 } }}
          transition={{ duration: duration.reveal, ease: ease.inOut }}
        >
          <motion.div
            className="gutter flex flex-1 flex-col justify-between pb-8 pt-28"
            variants={stagger(0.06, 0.18)}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <ul className="flex flex-col">
              {navLinks.map((link, i) => (
                <li key={link.href}>
                  <a
                    ref={i === 0 ? firstLink : undefined}
                    href={link.href}
                    onClick={(e) => {
                      e.preventDefault()
                      navigate(link.href)
                    }}
                    className="group block overflow-hidden py-3 pb-[0.6rem]"
                  >
                    <motion.span
                      variants={maskLine}
                      className="font-display block text-[clamp(2.5rem,11vw,5rem)] leading-[1.08] tracking-[-0.035em] transition-opacity duration-200 group-hover:opacity-70"
                    >
                      {link.label}
                    </motion.span>
                  </a>
                </li>
              ))}
            </ul>

            <motion.div variants={fadeUp} className="mt-10 flex flex-col gap-8">
              <Button
                size="lg"
                className="w-full"
                onClick={() => {
                  onClose()
                  openBooking()
                }}
              >
                Book a drive
              </Button>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="meta mb-3 text-stone">Cities</p>
                  <ul className="meta space-y-2 leading-relaxed">
                    {locations.map((l) => (
                      <li key={l.id}>{l.city}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="meta mb-3 text-stone">Guests</p>
                  <ul className="meta space-y-2 leading-relaxed">
                    {account.google && (
                      <li>
                        <a href="#account" onClick={onClose} className="transition-colors hover:text-stone">
                          {account.user ? 'Your account' : 'Sign in'}
                        </a>
                      </li>
                    )}
                    {guestLinks.map((l) => (
                      <li key={l.href}>
                        <a href={l.href} onClick={onClose} className="transition-colors hover:text-stone">
                          {l.label}
                        </a>
                      </li>
                    ))}
                    {socials.map((s) => (
                      <li key={s.label}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-stone">
                          {s.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
                <a href={`mailto:${brand.email}`} className="meta col-span-2 text-stone transition-colors hover:text-bone">
                  {brand.email}
                </a>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
