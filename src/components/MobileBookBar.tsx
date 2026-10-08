import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { ease } from '../animations/tokens'
import { useSite } from '../hooks/useSite'
import { useStageUI } from '../three/store'

/**
 * Phones only: once the visitor has scrolled past the opening car, a single
 * "Book a drive" capsule rests at the bottom of the screen, within reach of
 * the thumb. It steps aside over the request form and the footer, where the
 * same action is already on the page, and while any panel is open.
 */
export function MobileBookBar() {
  const { booking, openBooking } = useSite()
  const intro = useStageUI((s) => s.intro)
  const [past, setPast] = useState(false)
  const [covered, setCovered] = useState(false)

  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > window.innerHeight * 0.85)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const targets = [document.getElementById('concierge'), document.querySelector('footer')].filter(Boolean) as Element[]
    const seen = new Set<Element>()
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) seen.add(e.target)
        else seen.delete(e.target)
      }
      setCovered(seen.size > 0)
    })
    targets.forEach((t) => io.observe(t))
    return () => io.disconnect()
  }, [])

  const show = past && !covered && !booking && intro !== 'logo'

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="book-bar"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.45, ease: ease.out }}
        >
          <button
            type="button"
            onClick={() => openBooking()}
            className="pointer-events-auto h-12 w-full max-w-[22rem] rounded-full bg-ink/90 text-[1.0625rem] text-bone shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-md"
          >
            Book a drive
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
