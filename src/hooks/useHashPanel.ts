import { useCallback, useEffect, useState } from 'react'

/** Panels that open from a link anywhere on the page: <a href="#privacy">. */
export const panelHashes = ['account', 'manage', 'privacy', 'terms'] as const
export type PanelId = (typeof panelHashes)[number]

const read = (): PanelId | null => {
  const h = window.location.hash.replace(/^#/, '')
  return (panelHashes as readonly string[]).includes(h) ? (h as PanelId) : null
}

/**
 * Hash routes without a router: #account, #manage, #privacy and #terms open a side sheet,
 * so they can be linked to, bookmarked and closed with the back button.
 */
export function useHashPanel() {
  const [panel, setPanel] = useState<PanelId | null>(() => (typeof window === 'undefined' ? null : read()))

  useEffect(() => {
    const sync = () => setPanel(read())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  const close = useCallback(() => {
    // Drop the hash without scrolling the page back to the top.
    history.replaceState(null, '', window.location.pathname + window.location.search)
    setPanel(null)
  }, [])

  return { panel, close }
}
