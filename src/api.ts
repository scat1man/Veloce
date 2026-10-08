/**
 * The website's only door to the backend. In development Vite forwards /api to
 * the Express server on :3001 (see vite.config.ts); in production the same
 * server hosts both, so relative URLs work in both places.
 */

export type BookingRequest = {
  vehicleId: string | null
  cityId: string
  pickup: string
  returnDate: string
  name: string
  email: string
  /** Honeypot field: always empty for people. */
  website?: string
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled'

export type Booking = BookingRequest & { reference: string; status: BookingStatus }

/** What a guest sees about their request: no personal details. */
export type BookingSummary = {
  reference: string
  vehicle: string | null
  city: string
  pickup: string
  returnDate: string
  status: BookingStatus
}

/** An error from the API, with the HTTP status (0 when the server could not be reached). */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Used when the server gives no message of its own (e.g. a proxy error page).
const fallbackMessage = (status: number) => {
  if (status === 429) return 'Too many requests. Please wait a minute and try again.'
  if (status >= 500) return 'Something went wrong on our side. Please try again shortly, or email the concierge.'
  return `Request failed (${status}).`
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(typeof body.error === 'string' && body.error ? body.error : fallbackMessage(res.status), res.status)
  return body as T
}

export const createBooking = (data: BookingRequest) =>
  call<Booking>('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })

export const checkAvailability = (vehicleId: string, pickup: string, returnDate: string, signal?: AbortSignal) =>
  call<{ available: boolean }>(`/api/availability?${new URLSearchParams({ vehicleId, pickup, returnDate })}`, { signal }).then((r) => r.available)

/** A guest checks their request: the reference and the email it was made with must both match. */
export const lookupBooking = (reference: string, email: string) =>
  call<BookingSummary>('/api/bookings/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference: reference.trim().toUpperCase(), email: email.trim() }),
  })

// ---- Guest accounts: "Continue with Google" ----

export type Account = { google: boolean; user: { name: string; email: string } | null }

/** Whether Google sign-in is switched on, and who is signed in (if anyone). */
export const getAccount = () => call<Account>('/api/account')

/** Every booking made with the signed-in guest's email. */
export const getMyBookings = () => call<BookingSummary[]>('/api/account/bookings')

export const signOut = () => call<{ ok: true }>('/api/account/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })

/**
 * Where "Continue with Google" goes: the server sends the visitor to Google and,
 * once they are signed in, back to `returnTo` on this site.
 */
export const googleSignInUrl = (returnTo: string) => `/auth/google?${new URLSearchParams({ return: returnTo })}`
