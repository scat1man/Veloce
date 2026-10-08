// Guest accounts: a guest who signs in with Google gets a row in `customers` and a server-side
// session, so the site can fill in their details and list their bookings. Like the admin
// session, the cookie holds only a random id; the database keeps its SHA-256 hash.
import { createHash, randomBytes } from 'node:crypto'
import { parseCookies } from './security.js'

export const GUEST_COOKIE = 'veloce_guest'
const cookieName = (req) => (req.secure ? `__Host-${GUEST_COOKIE}` : GUEST_COOKIE)
const hash = (id) => createHash('sha256').update(`veloce-guest:${id}`).digest('hex')
export const GUEST_SESSION_DAYS = 30

export function createAccountStore(db) {
  const ttl = GUEST_SESSION_DAYS * 864e5
  const upsert = db.prepare(`
    INSERT INTO customers (google_sub, email, name) VALUES (?, ?, ?)
    ON CONFLICT (google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, last_login_at = datetime('now')
    RETURNING id
  `)
  const insertSession = db.prepare('INSERT INTO customer_sessions (id_hash, customer_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
  const findSession = db.prepare(`
    SELECT c.id, c.email, c.name FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
    WHERE s.id_hash = ? AND s.expires_at > ?
  `)
  const removeSession = db.prepare('DELETE FROM customer_sessions WHERE id_hash = ?')
  const purgeSessions = db.prepare('DELETE FROM customer_sessions WHERE expires_at <= ?')
  // Guests who have not signed in for the retention period are forgotten, like their old bookings.
  const purgeCustomers = db.prepare("DELETE FROM customers WHERE last_login_at < datetime('now', ?)")
  const bookingsFor = db.prepare(`
    SELECT reference, vehicle_id, city_id, pickup, return_date, status, created_at FROM bookings
    WHERE email = ? ORDER BY pickup DESC, id DESC LIMIT 50
  `)

  return {
    ttl,
    /** Records a Google sign-in and opens a session. Returns the session id for the cookie. */
    signIn({ sub, email, name }) {
      const { id: customerId } = upsert.get(sub, email, name)
      const id = randomBytes(32).toString('base64url')
      const now = Date.now()
      insertSession.run(hash(id), customerId, now + ttl, now)
      return id
    },
    /** The signed-in guest for a session id, or null. */
    current(id) {
      if (typeof id !== 'string' || id.length < 20 || id.length > 100) return null
      return findSession.get(hash(id), Date.now()) ?? null
    },
    signOut(id) {
      if (typeof id === 'string' && id.length <= 100) removeSession.run(hash(id))
    },
    /** Bookings made with this (Google-verified) email, signed in or not when they were made. */
    bookings: (email) => bookingsFor.all(email),
    purge(days) {
      const expired = Number(purgeSessions.run(Date.now()).changes)
      const forgotten = Number(purgeCustomers.run(`-${Math.floor(days)} days`).changes)
      return { expired, forgotten }
    },
  }
}

export const guestSessionId = (req) => parseCookies(req.headers.cookie)[cookieName(req)]

export function setGuestCookie(req, res, id, ttlMs) {
  res.cookie(cookieName(req), id, { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/', maxAge: ttlMs })
}

export function clearGuestCookie(req, res) {
  res.clearCookie(cookieName(req), { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' })
}
