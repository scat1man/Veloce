import { useEffect } from 'react'
import { holdScroll } from './smoothScroll'

/** Locks page scroll while `locked` is true (stacking-safe across overlays). */
let locks = 0
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    locks += 1
    holdScroll(true)
    document.documentElement.style.overflow = 'hidden'
    return () => {
      locks -= 1
      holdScroll(false)
      if (locks === 0) {
        document.documentElement.style.overflow = ''
      }
    }
  }, [locked])
}
