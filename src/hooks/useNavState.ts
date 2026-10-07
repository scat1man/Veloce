import { useEffect, useState } from 'react'

type NavState = {
  /** Theme of the section currently underneath the navigation bar. */
  theme: 'dark' | 'light'
  /** Section id under the middle of the viewport. */
  active: string | null
  /** Past the first ~70% of the hero. */
  scrolled: boolean
}

/**
 * Reads `data-nav-theme` sections to decide how the fixed nav should look.
 * One rAF-throttled scroll listener; cheap with a handful of sections.
 */
export function useNavState(probe = 36): NavState {
  const [state, setState] = useState<NavState>({ theme: 'dark', active: null, scrolled: false })

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-nav-theme]'))
      const mid = window.innerHeight * 0.45
      let theme: NavState['theme'] = 'dark'
      let active: string | null = null
      let topmost = -Infinity
      for (const el of sections) {
        const r = el.getBoundingClientRect()
        // Later sections stack over earlier ones (the hero is sticky), so take the last match.
        if (r.top <= probe && r.bottom > probe && r.top >= topmost) {
          topmost = r.top
          theme = (el.dataset.navTheme as NavState['theme']) ?? 'dark'
        }
        if (el.id && r.top <= mid && r.bottom > mid) active = el.id
      }
      const scrolled = window.scrollY > window.innerHeight * 0.7
      setState((s) =>
        s.theme === theme && s.active === active && s.scrolled === scrolled ? s : { theme, active, scrolled },
      )
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [probe])

  return state
}
