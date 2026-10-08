// Booking rules live here, separate from HTTP, so they read as plain logic.
import { randomInt } from 'node:crypto'
import { cities, vehicles } from './catalog.js'

const DATE = /^\d{4}-\d{2}-\d{2}$/
// The HTML standard's own rule for <input type="email">, plus a dot in the domain:
// no spaces, quotes, angle brackets or other characters that could break out of markup or a mail header.
const EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/
// Letters and digits people do not confuse when reading a reference aloud (no 0/O, 1/I/L).
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const REF_LENGTH = 8
const MAX_DAYS = 60
const MAX_AHEAD_DAYS = 730
export const STATUSES = ['pending', 'confirmed', 'cancelled']
export const LIMITS = { name: 120, email: 200, reference: 32, note: 2000 }

const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
const todayUtc = () => new Date().toISOString().slice(0, 10)
const isString = (v) => typeof v === 'string'
// Rejects impossible dates such as 2026-02-31, which Date.parse would quietly roll over.
const isRealDate = (v) => isString(v) && DATE.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v)
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/
// eslint-disable-next-line no-control-regex
const NOTE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/
// Names are shown to staff and pasted into emails: angle brackets have no place in one.
const NAME_FORBIDDEN = /[<>{}[\]\\|`$]/

/** Returns an error message, or null when the request is acceptable. Only plain strings are accepted. */
export function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Invalid request.'
  const { vehicleId, cityId, pickup, returnDate, name, email } = input
  if (vehicleId !== undefined && vehicleId !== null && vehicleId !== '') {
    if (!isString(vehicleId) || !Object.hasOwn(vehicles, vehicleId)) return 'Unknown car.'
  }
  if (!isString(cityId) || !Object.hasOwn(cities, cityId)) return 'Unknown city.'
  if (!isRealDate(pickup)) return 'Pick-up date is invalid.'
  if (!isRealDate(returnDate)) return 'Return date is invalid.'
  // One day of slack: the browser picks "today" in the visitor's time zone, the server in UTC.
  if (dayDiff(todayUtc(), pickup) < -1) return 'Pick-up date is in the past.'
  if (dayDiff(todayUtc(), pickup) > MAX_AHEAD_DAYS) return 'Pick-up date is too far ahead.'
  if (returnDate <= pickup) return 'Return must be after pick-up.'
  if (dayDiff(pickup, returnDate) > MAX_DAYS) return `Bookings are limited to ${MAX_DAYS} days.`
  if (!isString(name) || !name.trim() || name.length > LIMITS.name || CONTROL.test(name) || NAME_FORBIDDEN.test(name)) return 'Please enter your name.'
  if (!isString(email) || email.length > LIMITS.email || !EMAIL.test(email.trim()) || email.trim().split('@')[0].length > 64) return 'Please enter a valid email.'
  return null
}

export function newReference() {
  let code = ''
  for (let i = 0; i < REF_LENGTH; i++) code += REF_ALPHABET[randomInt(REF_ALPHABET.length)]
  return 'VLC-' + code
}

/** All booking queries for one database. */
export function createBookingStore(db) {
  /*
   * Two date ranges overlap when each starts before the other ends.
   * The return day counts as free, so one guest can hand back the car the morning
   * the next one collects it.
   */
  const overlapping = db.prepare(`
    SELECT reference FROM bookings
    WHERE vehicle_id = ? AND status != 'cancelled'
      AND pickup < ? AND return_date > ?
    LIMIT 1
  `)
  const insert = db.prepare(`
    INSERT INTO bookings (reference, vehicle_id, city_id, pickup, return_date, name, email, customer_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const byReference = db.prepare('SELECT * FROM bookings WHERE reference = ?')
  const byReferenceAndEmail = db.prepare('SELECT * FROM bookings WHERE reference = ? AND email = ?')
  const all = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC, id DESC LIMIT 1000')
  const setStatus = db.prepare("UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE reference = ?")
  const setNote = db.prepare("UPDATE bookings SET note = ?, updated_at = datetime('now') WHERE reference = ?")
  const remove = db.prepare('DELETE FROM bookings WHERE reference = ?')
  const purgeOld = db.prepare("DELETE FROM bookings WHERE return_date < date('now', ?)")

  const isAvailable = (vehicleId, pickup, returnDate) => !overlapping.get(vehicleId, returnDate, pickup)
  const findBooking = (reference) => toJson(byReference.get(reference))

  return {
    isAvailable,
    findBooking,

    /** `customerId` links the booking to a signed-in guest's account, whatever email they typed. */
    createBooking({ vehicleId, cityId, pickup, returnDate, name, email }, customerId = null) {
      // 31^8 ≈ 850 billion codes, so a clash is near impossible; retry anyway rather than fail.
      for (let attempt = 0; ; attempt++) {
        const reference = newReference()
        try {
          insert.run(reference, vehicleId || null, cityId, pickup, returnDate, name.trim(), email.trim().toLowerCase(), customerId)
          return findBooking(reference)
        } catch (err) {
          if (attempt >= 4 || !/UNIQUE/i.test(String(err?.message))) throw err
        }
      }
    },

    /** Public lookup: both the reference and the email on the booking must match. */
    lookup(reference, email) {
      return toJson(byReferenceAndEmail.get(reference.trim().toUpperCase(), email.trim().toLowerCase()))
    },

    listBookings: () => all.all().map(toJson),

    updateStatus(reference, status) {
      if (!STATUSES.includes(status)) return { error: 'Unknown status.', invalid: true }
      const booking = findBooking(reference)
      if (!booking) return { error: 'Booking not found.', notFound: true }
      // Re-opening a cancelled booking must not double-book the car.
      if (booking.status === 'cancelled' && status !== 'cancelled' && booking.vehicleId && !isAvailable(booking.vehicleId, booking.pickup, booking.returnDate))
        return { error: 'That car has since been booked for these dates.' }
      setStatus.run(status, reference)
      return { booking: findBooking(reference), previous: booking.status }
    },

    /** Staff note on a booking. Newlines and tabs are fine; other control characters are not. */
    updateNote(reference, note) {
      if (typeof note !== 'string' || note.length > LIMITS.note || NOTE_CONTROL.test(note))
        return { error: `Notes are plain text, up to ${LIMITS.note} characters.`, invalid: true }
      if (!findBooking(reference)) return { error: 'Booking not found.', notFound: true }
      setNote.run(note.trim(), reference)
      return { booking: findBooking(reference) }
    },

    /** Removes a booking and the guest's details for good (e.g. a guest asks to be forgotten). */
    deleteBooking(reference) {
      return Number(remove.run(reference).changes) > 0
    },

    /** Deletes bookings whose car came back more than `days` days ago. Returns how many. */
    purge(days) {
      return Number(purgeOld.run(`-${Math.floor(days)} days`).changes)
    },
  }
}

// Database rows use snake_case; the API speaks camelCase like the frontend.
function toJson(row) {
  if (!row) return null
  return {
    reference: row.reference,
    vehicleId: row.vehicle_id,
    vehicle: row.vehicle_id ? vehicles[row.vehicle_id] : null,
    cityId: row.city_id,
    city: cities[row.city_id],
    pickup: row.pickup,
    returnDate: row.return_date,
    name: row.name,
    email: row.email,
    status: row.status,
    note: row.note ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
    // Online deposit: status is none | paid | refunded; amount is in the smallest unit (paise, cents).
    payment: {
      status: row.payment_status ?? 'none',
      amount: row.payment_status && row.payment_status !== 'none' ? row.payment_amount : null,
      currency: row.payment_status && row.payment_status !== 'none' ? row.payment_currency : null,
      paymentId: row.payment_id ?? null,
      paidAt: row.paid_at ?? null,
    },
  }
}
