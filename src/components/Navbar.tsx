import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type MouseEvent } from 'react'
import { duration, ease } from '../animations/tokens'
import { useStageUI } from '../three/store'
import { navLinks } from '../data/content'
import { useNavState } from '../hooks/useNavState'
import { scrollToHash } from '../hooks/scrollTo'
import { useAccount } from '../hooks/useAccount'
import { useSite } from '../hooks/useSite'
import { Button } from './Button'
import { MobileMenu } from './MobileMenu'
import { Wordmark } from './Wordmark'

/**
 * Primary navigation. Transparent over the hero; once the hero is behind us it
 * becomes a translucent, blurred bar with a hairline. Links rest at 70% and come
 * to full strength on hover/focus; the current section is marked by a 
 * hairline that glides between links.
 */
export function Navbar() {
  const { theme, active, scrolled } = useNavState()
  const { openBooking } = useSite()
  const account = useAccount()
  const [menuOpen, setMenuOpen] = useState(false)
  const reduce = useReducedMotion()
  // The navigation waits for the opening logo to leave.
  const shown = useStageUI((st) => st.intro !== 'logo')
  const light = theme === 'light' && !menuOpen

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    const onHash = () => setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('hashchange', onHash)
    }
  }, [menuOpen])

  const go = (e: MouseEvent<HTMLElement>, href: string) => {
    e.preventDefault()
    scrollToHash(href)
  }

  return (
    <>
      <motion.header
        className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${light ? 'text-ink' : 'text-bone'}`}
        initial={reduce ? false : { opacity: 0 }}
        animate={shown || reduce ? { opacity: 1 } : { opacity: 0 }}
        style={{ pointerEvents: shown || reduce ? undefined : 'none' }}
        transition={{ delay: 0.2, duration: duration.reveal, ease: ease.soft }}
      >
        {/* Translucent surface once the hero is behind us */}
        <motion.div
          aria-hidden
          className={`absolute inset-0 backdrop-blur-md backdrop-saturate-150 transition-colors duration-300 ${
            light ? 'bg-paper/75' : 'bg-ink/70'
          }`}
          initial={false}
          animate={{ opacity: scrolled && !menuOpen ? 1 : 0 }}
          transition={{ duration: duration.uiSlow, ease: ease.soft }}
        />

        <nav
          aria-label="Primary"
          className={`gutter relative flex items-center justify-between transition-[height] duration-300 ease-[var(--ease-ui)] ${
            scrolled ? 'h-14' : 'h-14 md:h-[4.5rem]'
          }`}
        >
          <a
            href="#top"
            onClick={(e) => {
              setMenuOpen(false)
              go(e, '#top')
            }}
            className="flex h-11 items-center"
            aria-label="VELOCÉ — back to top"
          >
            <Wordmark key={shown ? 'in' : 'wait'} animateIn={!reduce} delay={0.35} />
          </a>

          <ul className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-9 lg:flex">
            {navLinks.map((link) => {
              const isActive = active === link.href.slice(1)
              return (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={(e) => go(e, link.href)}
                    aria-current={isActive ? 'true' : undefined}
                    className={`label relative inline-flex h-11 items-center transition-opacity duration-200 ease-[var(--ease-ui)] ${
                      isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100 focus-visible:opacity-100'
                    }`}
                  >
                    {link.label}
                    {isActive && (
                      <motion.span
                        aria-hidden
                        layoutId="nav-active"
                        className="absolute inset-x-0 bottom-2 h-px bg-current"
                        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                      />
                    )}
                  </a>
                </li>
              )
            })}
          </ul>

          <div className="hidden items-center gap-7 lg:flex">
            {account.google && (
              <a
                href="#account"
                className="label inline-flex h-11 items-center opacity-70 transition-opacity duration-200 ease-[var(--ease-ui)] hover:opacity-100 focus-visible:opacity-100"
              >
                {account.user ? account.user.name.split(' ')[0] || 'Account' : 'Sign in'}
              </a>
            )}
            <Button size="sm" tone={light ? 'onLight' : 'onDark'} onClick={() => openBooking()}>
              Book a drive
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="label relative z-50 -mr-2 flex h-11 items-center gap-3 px-2 lg:hidden"
          >
            <span className="relative block overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={menuOpen ? 'close' : 'menu'}
                  className="block"
                  initial={{ y: '100%' }}
                  animate={{ y: '0%' }}
                  exit={{ y: '-100%' }}
                  transition={{ duration: duration.ui, ease: ease.out }}
                >
                  {menuOpen ? 'Close' : 'Menu'}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="relative block h-3 w-6" aria-hidden>
              <motion.span
                className="absolute left-0 top-0.5 h-px w-full bg-current"
                animate={menuOpen ? { y: 4.5, rotate: 45 } : { y: 0, rotate: 0 }}
                transition={{ duration: duration.uiSlow, ease: ease.out }}
              />
              <motion.span
                className="absolute bottom-0.5 right-0 h-px w-full bg-current"
                animate={menuOpen ? { y: -4.5, rotate: -45, width: '100%' } : { y: 0, rotate: 0, width: '62%' }}
                transition={{ duration: duration.uiSlow, ease: ease.out }}
              />
            </span>
          </button>
        </nav>
      </motion.header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}
