import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type BookingIntent = { vehicleId?: string; locationId?: string; pickup?: string; returnDate?: string }

type SiteContextValue = {
  booking: BookingIntent | null
  openBooking: (intent?: BookingIntent) => void
  closeBooking: () => void
}

const SiteContext = createContext<SiteContextValue | null>(null)

/** App-level UI state that many sections reach for: the "request a drive" panel. */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [booking, setBooking] = useState<BookingIntent | null>(null)
  const openBooking = useCallback((intent: BookingIntent = {}) => setBooking(intent), [])
  const closeBooking = useCallback(() => setBooking(null), [])
  const value = useMemo(() => ({ booking, openBooking, closeBooking }), [booking, openBooking, closeBooking])
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export function useSite() {
  const ctx = useContext(SiteContext)
  if (!ctx) throw new Error('useSite must be used inside <SiteProvider>')
  return ctx
}
