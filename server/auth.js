// Admin sign-in: one shared password (ADMIN_PASSWORD, or its scrypt hash in ADMIN_PASSWORD_HASH),
// server-side sessions in SQLite, and a cookie that only ever holds a random session id.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { parseCookies } from './security.js'

// Over HTTPS the cookie gets the __Host- prefix: browsers then insist it is Secure, sent to
// this exact host only, for every path, so no subdomain or plain-http page can set or overwrite it.
export const COOKIE = 'veloce_admin'
export const SECURE_COOKIE = `__Host-${COOKIE}`
const cookieName = (req) => (req.secure ? SECURE_COOKIE : COOKIE)
const sha256 = (value) => createHash('sha256').update(value).digest()
const MAX_PASSWORD = 1024

// ---- Password hashes: "scrypt$N$r$p$salt$hash", salt and hash in base64url ----

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 32 }
const scryptOptions = (N, r, p) => ({ N, r, p, maxmem: 128 * N * r * 2 })

/** Hashes a password for ADMIN_PASSWORD_HASH (see `npm run hash-password`). */
export function hashPassword(password, salt = randomBytes(16)) {
  const { N, r, p, keylen } = SCRYPT
  const hash = scryptSync(password.trim(), salt, keylen, scryptOptions(N, r, p))
  return ['scrypt', N, r, p, salt.toString('base64url'), hash.toString('base64url')].join('$')
}

/** Parses a stored hash, or returns null when it is not one we can check. */
export function parseHash(text) {
  const parts = typeof text === 'string' ? text.trim().split('$') : []
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null
  const [N, r, p] = parts.slice(1, 4).map(Number)
  const salt = Buffer.from(parts[4], 'base64url')
  const hash = Buffer.from(parts[5], 'base64url')
  // Bounds keep a typo in the host's settings from making every sign-in take minutes.
  if (!Number.isInteger(Math.log2(N)) || N < 2 ** 14 || N > 2 ** 17 || !(r >= 1 && r <= 16) || !(p >= 1 && p <= 4)) return null
  if (salt.length < 16 || hash.length < 32) return null
  return { N, r, p, salt, hash }
}

/**
 * Checks a typed password against the configured secret: a plain string (ADMIN_PASSWORD)
 * or a parsed scrypt hash. Always constant-time; hashing first makes both sides the same length.
 */
export function passwordMatches(candidate, expected) {
  if (typeof candidate !== 'string' || candidate.length > MAX_PASSWORD) return false
  // Leading/trailing spaces are ignored on both sides (config.js trims ADMIN_PASSWORD too),
  // so a copy-pasted password with a stray space still works.
  const typed = candidate.trim()
  if (typed.length === 0 || !expected) return false
  if (typeof expected === 'string') return timingSafeEqual(sha256(typed), sha256(expected))
  const { N, r, p, salt, hash } = expected
  return timingSafeEqual(scryptSync(typed, salt, hash.length, scryptOptions(N, r, p)), hash)
}

/**
 * `secret` is the configured password or hash. It is mixed into how session ids are stored,
 * so changing the admin password signs every existing session out.
 */
export function createSessionStore(db, { hours, secret = '' }) {
  const ttl = hours * 3600_000
  const insert = db.prepare('INSERT INTO sessions (id_hash, expires_at, created_at) VALUES (?, ?, ?)')
  const find = db.prepare('SELECT expires_at FROM sessions WHERE id_hash = ?')
  const remove = db.prepare('DELETE FROM sessions WHERE id_hash = ?')
  const purge = db.prepare('DELETE FROM sessions WHERE expires_at <= ?')
  const epoch = sha256(`veloce-session:${typeof secret === 'string' ? secret : secret.hash.toString('base64url')}`).toString('hex')
  // Only the hash is stored, so a leaked database file cannot be replayed as a cookie.
  const key = (id) => sha256(epoch + id).toString('hex')

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
      if (typeof id === 'string' && id.length <= 100) remove.run(key(id))
    },
    purgeExpired: () => Number(purge.run(Date.now()).changes),
  }
}

export const sessionId = (req) => parseCookies(req.headers.cookie)[cookieName(req)]

export function setSessionCookie(req, res, id, ttlMs) {
  res.cookie(cookieName(req), id, {
    httpOnly: true,
    sameSite: 'strict',
    // req.secure respects the `trust proxy` setting, so this is true behind an HTTPS proxy.
    secure: req.secure,
    path: '/',
    maxAge: ttlMs,
    priority: 'high',
  })
}

export function clearSessionCookie(req, res) {
  res.clearCookie(cookieName(req), { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' })
}
