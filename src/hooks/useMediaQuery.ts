import { useSyncExternalStore } from 'react'

/** Subscribe to a CSS media query. SSR-safe default is `false`. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)')
/** True only for devices with a real hover-capable, precise pointer. */
export const useFinePointer = () => useMediaQuery('(hover: hover) and (pointer: fine)')
