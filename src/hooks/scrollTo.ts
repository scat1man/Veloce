import { smoothScroller } from './smoothScroll'

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Scroll to an in-page anchor (or a pixel offset), smoothly where allowed. */
export function scrollToHash(href: string, opts: { offset?: number; immediate?: boolean } = {}) {
  const id = href.replace(/^#/, '')
  const el = id && id !== 'top' ? document.getElementById(id) : null
  if (id && id !== 'top' && !el) return
  const top = el ? el.getBoundingClientRect().top + window.scrollY + (opts.offset ?? 0) : 0
  const lenis = smoothScroller()
  if (lenis && !opts.immediate) {
    // A long, even glide: quick to leave, gentle to arrive, never longer than ~1.6 s.
    const distance = Math.abs(top - window.scrollY) / window.innerHeight
    lenis.scrollTo(top, { duration: Math.min(1.6, 0.8 + distance * 0.12), easing: easeInOutQuart, force: true })
    return
  }
  window.scrollTo({ top, behavior: prefersReducedMotion() || opts.immediate ? 'auto' : 'smooth' })
}

const easeInOutQuart = (x: number) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2)
