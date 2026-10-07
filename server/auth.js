// Admin sign-in: one shared password (ADMIN_PASSWORD), server-side sessions in SQLite,
// and a cookie that only ever holds a random session id.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { parseCookies } from './security.js'

export const COOKIE = 'veloce_admin'
const sha256 = (value) => createHash('sha256').update(value).digest()

/** Constant-time comparison: hashing first makes both sides the same length. */
export function passwordMatches(candidate, expected) {
  if (typeof candidate !== 'string' || candidate.length > 1024) return false
  // Leading/trailing spaces are ignored on both sides (config.js trims ADMIN_PASSWORD too),
  // so a copy-pasted password with a stray space still works.
  const typed = candidate.trim()
  if (typed.length === 0) return false
  return timingSafeEqual(sha256(typed), sha256(expected))
}

export function createSessionStore(db, { hours }) {
  const ttl = hours * 3600_000
  const insert = db.prepare('INSERT INTO sessions (id_hash, expires_at, created_at) VALUES (?, ?, ?)')
  const find = db.prepare('SELECT expires_at FROM sessions WHERE id_hash = ?')
  const remove = db.prepare('DELETE FROM sessions WHERE id_hash = ?')
  const purge = db.prepare('DELETE FROM sessions WHERE expires_at <= ?')
  // Only the hash is stored, so a leaked database file cannot be replayed as a cookie.
  const key = (id) => sha256(id).toString('hex')

  return {
    ttl,
    create() {
      const id = randomBytes(32).toString('base64url')
      const now = Date.now()
      insert.run(key(id), now + ttl, now)
      return id
    },
    valid(id) {
      if (typeof id !== 'string' || id.length < 20 || id.length > 100) return false
      const row = find.get(key(id))
      return Boolean(row && row.expires_at > Date.now())
    },
    /** Unix ms when this session ends, or null. */
    expiresAt(id) {
      if (!this.valid(id)) return null
      return find.get(key(id)).expires_at
    },
    destroy(id) {
      if (typeof id === 'string') remove.run(key(id))
    },
    purgeExpired: () => Number(purge.run(Date.now()).changes),
  }
}

export const sessionId = (req) => parseCookies(req.headers.cookie)[COOKIE]

export function setSessionCookie(req, res, id, ttlMs) {
  res.cookie(COOKIE, id, {
    httpOnly: true,
    sameSite: 'strict',
    // req.secure respects the `trust proxy` setting, so this is true behind an HTTPS proxy.
    secure: req.secure,
    path: '/',
    maxAge: ttlMs,
  })
}

export function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' })
}
