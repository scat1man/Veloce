/**
 * Visitor analytics, reported to our own server (POST /api/events) and shown on the
 * console's Analytics page. No cookies, no storage, no third parties: the server counts
 * a visitor with a hash that changes every day. Visitors who ask not to be tracked
 * (Do Not Track or Global Privacy Control) and automated browsers send nothing.
 */

type Event = { kind: 'pageview'; referrer: string; utm: string } | { kind: 'section' | 'car'; name: string } | { kind: 'booking_start' }

const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { globalPrivacyControl?: boolean })
const off = !nav || nav.webdriver || nav.doNotTrack === '1' || nav.globalPrivacyControl === true
const sent = new Set<string>()

function send(event: Event) {
  if (off) return
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      // Still delivered if the visitor is leaving the page.
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Analytics never gets in the way of the site.
  }
}

/** Reports something once per page load. */
function once(key: string, event: Event) {
  if (sent.has(key)) return
  sent.add(key)
  send(event)
}

/** A visitor opened a car in the Showroom. */
export const trackCar = (id: string) => once(`car:${id}`, { kind: 'car', name: id })

/** A visitor began filling in a booking form. */
export const trackBookingStart = () => once('booking_start', { kind: 'booking_start' })

/**
 * The page view, then each section as it crosses the middle of the screen.
 * Returns a cleanup function; safe to call twice (React StrictMode does in development).
 */
export function startAnalytics(): () => void {
  if (off) return () => {}
  once('pageview', { kind: 'pageview', referrer: document.referrer, utm: new URLSearchParams(location.search).get('utm_source') ?? '' })
  if (typeof IntersectionObserver === 'undefined') return () => {}
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const id = (e.target as HTMLElement).id
        once(`section:${id}`, { kind: 'section', name: id })
        io.unobserve(e.target)
      }
    },
    // A section counts once it reaches the middle fifth of the screen, however tall it is.
    { rootMargin: '-40% 0px -40% 0px' },
  )
  document.querySelectorAll('main section[id]').forEach((el) => io.observe(el))
  return () => io.disconnect()
}
