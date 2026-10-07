// The whole HTTP app, built by createApp() so tests can start it with their own
// settings and data folder. server/index.js only loads the config and listens.
import compression from 'compression'
import express from 'express'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearSessionCookie, createSessionStore, passwordMatches, sessionId, setSessionCookie } from './auth.js'
import { createBookingStore, LIMITS, newReference, validate } from './bookings.js'
import { cities, vehicles } from './catalog.js'
import { loadConfig } from './config.js'
import { openDb } from './db.js'
import { RateLimiter, rateLimit, sameOrigin, securityHeaders, tooMany } from './security.js'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const DEFAULT_LIMITS = {
  bookings: { limit: 5, windowMs: 10 * MINUTE },
  lookup: { limit: 10, windowMs: 10 * MINUTE },
  availability: { limit: 60, windowMs: MINUTE },
  loginFailures: { limit: 5, windowMs: 15 * MINUTE },
}
const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const isString = (v) => typeof v === 'string'

/**
 * Builds the Express app. `options` are config overrides (see config.js), e.g.
 * { env: 'production', adminPassword, dataDir, limits }. Throws ConfigError on unsafe settings.
 * Returns { app, config, close } — close() stops timers and closes the database.
 */
export function createApp(options = {}) {
  const config = loadConfig(options.processEnv ?? process.env, options)
  const { log } = config
  const audit = (event, fields) =>
    log(`[audit] ${new Date().toISOString()} ${event} ${Object.entries(fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}`)

  const db = openDb(config.dataDir)
  const bookings = createBookingStore(db)
  const sessions = createSessionStore(db, { hours: config.sessionHours })

  const limits = { ...DEFAULT_LIMITS, ...config.limits }
  const limiters = Object.fromEntries(Object.entries(limits).map(([name, opts]) => [name, new RateLimiter(opts)]))

  // ---- Housekeeping: forget old bookings and expired sessions, at start and once a day ----
  const retention = () => {
    try {
      const removed = bookings.purge(config.retentionDays)
      const expired = sessions.purgeExpired()
      if (removed || expired) log(`[retention] removed ${removed} booking(s) older than ${config.retentionDays} days, ${expired} expired session(s)`)
    } catch (err) {
      console.error('[retention] failed:', err)
    }
  }
  retention()
  const timers = [
    setInterval(retention, DAY),
    setInterval(() => Object.values(limiters).forEach((l) => l.sweep()), MINUTE),
  ]
  timers.forEach((t) => t.unref())

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy)
  // Stop Express from parsing ?a[b]=c into objects: every query value is a string or an array.
  app.set('query parser', 'simple')

  // Behind Render/Railway/Fly the proxy terminates TLS and reports the original scheme.
  if (config.forceHttps) {
    app.use((req, res, next) => {
      if (req.headers['x-forwarded-proto'] === 'http' && req.hostname) return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`)
      next()
    })
  }
  app.use(securityHeaders(config))
  // Gzip every text response (JS, CSS, HTML, JSON): the main 3D bundle drops from 1.2 MB to about 370 KB.
  app.use(compression())
  app.use(express.json({ limit: '10kb' }))
  app.use(['/api', '/admin'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  // ---- Public API: what the website calls ----

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  // Live check while the visitor picks a car and dates.
  app.get('/api/availability', rateLimit(limiters.availability), (req, res) => {
    const { vehicleId, pickup, returnDate } = req.query
    if (!isString(vehicleId) || !isString(pickup) || !isString(returnDate))
      return res.status(400).json({ error: 'vehicleId, pickup and returnDate are required.' })
    if (!Object.hasOwn(vehicles, vehicleId)) return res.status(400).json({ error: 'Unknown car.' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pickup) || !/^\d{4}-\d{2}-\d{2}$/.test(returnDate))
      return res.status(400).json({ error: 'Dates must be YYYY-MM-DD.' })
    res.json({ available: bookings.isAvailable(vehicleId, pickup, returnDate) })
  })

  app.post('/api/bookings', rateLimit(limiters.bookings, 'Too many booking requests from your network. Please try again in a few minutes.'), (req, res) => {
    const input = req.body
    // Honeypot: `website` is a field real visitors never see. Bots that fill it get a
    // convincing success so they move on, and nothing is stored.
    if (input && typeof input === 'object' && input.website !== undefined && input.website !== null && input.website !== '') {
      audit('spam.honeypot', { ip: req.ip })
      return res.status(201).json(fakeBooking(input))
    }
    const error = validate(input)
    if (error) return res.status(400).json({ error })
    // The form checks availability too, but only the server's answer counts:
    // two people can submit the same car and dates at the same moment.
    if (input.vehicleId && !bookings.isAvailable(input.vehicleId, input.pickup, input.returnDate))
      return res.status(409).json({ error: 'That car is already booked for those dates. Try other dates or let us advise.' })
    res.status(201).json(bookings.createBooking(input))
  })

  // Status lookup needs both the reference and the email on the booking, so references
  // cannot be enumerated and nobody learns about someone else's booking.
  const NO_MATCH = { error: 'No booking matches that reference and email.' }
  app.post('/api/bookings/lookup', rateLimit(limiters.lookup, 'Too many lookups. Please wait a few minutes and try again.'), (req, res) => {
    const { reference, email } = req.body ?? {}
    if (!isString(reference) || !isString(email) || !reference.trim() || !email.trim() || reference.length > LIMITS.reference || email.length > LIMITS.email)
      return res.status(404).json(NO_MATCH)
    const booking = bookings.lookup(reference, email)
    if (!booking) return res.status(404).json(NO_MATCH)
    const { vehicle, city, pickup, returnDate, status } = booking
    res.json({ reference: booking.reference, vehicle, city, pickup, returnDate, status })
  })

  // ---- Concierge admin: password sign-in with a server-side session ----

  const loggedIn = (req) => sessions.valid(sessionId(req))
  const requireAdmin = (req, res, next) => (loggedIn(req) ? next() : res.status(401).json({ error: 'Please sign in.' }))
  // CSRF: the cookie is SameSite=Strict, and on top of that every state-changing admin
  // request must come from this site's own pages and carry JSON (which plain HTML forms cannot send).
  const guardWrite = (req, res, next) => {
    if (!sameOrigin(req)) {
      audit('admin.csrf_blocked', { ip: req.ip, path: req.path, origin: req.headers.origin ?? req.headers.referer ?? null })
      return res.status(403).json({ error: 'Cross-site request blocked.' })
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'Send JSON.' })
    next()
  }

  app.get('/admin', (req, res) => (loggedIn(req) ? res.sendFile(here('./admin.html')) : res.redirect(303, '/admin/login')))
  app.get('/admin/login', (req, res) => (loggedIn(req) ? res.redirect(303, '/admin') : res.sendFile(here('./login.html'))))
  // The admin pages' CSS and JS: no secrets in them, so no sign-in needed to load them.
  app.use('/admin', express.static(here('./public/'), { index: false, maxAge: 0 }))

  app.post('/api/admin/login', guardWrite, (req, res) => {
    const ip = req.ip ?? 'unknown'
    const wait = limiters.loginFailures.blocked(ip)
    if (wait) {
      audit('admin.login_blocked', { ip })
      return tooMany(res, wait, 'Too many failed sign-ins. Try again later.')
    }
    if (!passwordMatches(req.body?.password, config.adminPassword)) {
      limiters.loginFailures.hit(ip)
      audit('admin.login_failed', { ip })
      return res.status(401).json({ error: 'Wrong password.' })
    }
    limiters.loginFailures.reset(ip)
    setSessionCookie(req, res, sessions.create(), sessions.ttl)
    audit('admin.login_ok', { ip })
    res.json({ ok: true })
  })

  app.post('/api/admin/logout', guardWrite, (req, res) => {
    sessions.destroy(sessionId(req))
    clearSessionCookie(req, res)
    audit('admin.logout', { ip: req.ip })
    res.json({ ok: true })
  })

  app.get('/api/admin/session', (req, res) => res.json({ authenticated: loggedIn(req) }))
  app.get('/api/admin/bookings', requireAdmin, (_req, res) => res.json(bookings.listBookings()))
  app.patch('/api/admin/bookings/:reference', requireAdmin, guardWrite, (req, res) => {
    const reference = req.params.reference
    const status = req.body?.status
    if (reference.length > LIMITS.reference) return res.status(404).json({ error: 'Booking not found.' })
    const result = bookings.updateStatus(reference.toUpperCase(), status)
    if (result.error) return res.status(result.invalid ? 400 : result.notFound ? 404 : 409).json({ error: result.error })
    audit('admin.status_change', { ip: req.ip, reference: result.booking.reference, from: result.previous, to: status })
    res.json(result.booking)
  })

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }))

  // ---- Production: after `npm run build`, this server hosts the site too ----

  const dist = config.distDir
  if (existsSync(dist)) {
    // Built JS/CSS have a content hash in their name, so the browser may keep them forever.
    app.use('/assets', express.static(dist + 'assets', { immutable: true, maxAge: '1y' }))
    // Car models and photos rarely change: let the browser reuse them for a week instead of re-downloading.
    for (const dir of ['models', 'images', 'brands']) app.use(`/${dir}`, express.static(dist + dir, { maxAge: '7d' }))
    app.use(express.static(dist, { index: false }))
    // Page routes get the app; a missing file (e.g. a model) gets a real 404 instead of HTML.
    app.get('/{*splat}', (req, res, next) => {
      if (extname(req.path)) return next()
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(dist + 'index.html')
    })
  }

  // ---- Errors: always JSON for the API, never a stack trace ----

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = Number(err?.status ?? err?.statusCode)
    if (status >= 400 && status < 500) {
      const message =
        err.type === 'entity.parse.failed' ? 'Malformed JSON.' : err.type === 'entity.too.large' ? 'Request too large.' : 'Bad request.'
      return res.status(status).json({ error: message })
    }
    console.error(`[error] ${req.method} ${req.originalUrl}`, err)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  })

  return {
    app,
    config,
    close() {
      timers.forEach(clearInterval)
      db.close()
    },
  }
}

/** What a bot sees after filling the honeypot: shaped like a real booking, stored nowhere. */
function fakeBooking(input) {
  const str = (v, max) => (isString(v) ? v.slice(0, max) : '')
  const vehicleId = isString(input.vehicleId) && Object.hasOwn(vehicles, input.vehicleId) ? input.vehicleId : null
  const cityId = isString(input.cityId) && Object.hasOwn(cities, input.cityId) ? input.cityId : 'la'
  return {
    reference: newReference(),
    vehicleId,
    vehicle: vehicleId ? vehicles[vehicleId] : null,
    cityId,
    city: cities[cityId],
    pickup: str(input.pickup, 10),
    returnDate: str(input.returnDate, 10),
    name: str(input.name, LIMITS.name),
    email: str(input.email, LIMITS.email).toLowerCase(),
    status: 'pending',
    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }
}
