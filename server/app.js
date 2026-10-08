// The whole HTTP app, built by createApp() so tests can start it with their own
// settings and data folder. server/index.js only loads the config and listens.
import compression from 'compression'
import express from 'express'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearSessionCookie, createSessionStore, passwordMatches, sessionId, setSessionCookie } from './auth.js'
import { clearGuestCookie, createAccountStore, guestSessionId, setGuestCookie } from './accounts.js'
import { createActivityLog } from './activity.js'
import { createAnalytics, isBot } from './analytics.js'
import { createBookingStore, LIMITS, newReference, validate } from './bookings.js'
import { cities, vehicles } from './catalog.js'
import { loadConfig } from './config.js'
import { openDb } from './db.js'
import { bookingCancelled, bookingConfirmed, bookingReceived, depositReceived, depositRefunded, ownerNewBooking } from './emails.js'
import { createMailer } from './mailer.js'
import { CALLBACK_PATH, createGoogleAuth, safeReturnPath } from './google.js'
import { parseCookies, RateLimiter, rateLimit, sameOrigin, securityHeaders, tooMany } from './security.js'
import { createPaymentStore, createStripe, formatMoney } from './payments.js'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const DEFAULT_LIMITS = {
  bookings: { limit: 5, windowMs: 10 * MINUTE },
  lookup: { limit: 10, windowMs: 10 * MINUTE },
  payments: { limit: 20, windowMs: 10 * MINUTE },
  availability: { limit: 60, windowMs: MINUTE },
  loginFailures: { limit: 5, windowMs: 15 * MINUTE },
  // Site-wide caps, whatever the IP: a botnet spread over many addresses still hits these.
  loginFailuresGlobal: { limit: 30, windowMs: 15 * MINUTE },
  bookingsGlobal: { limit: 60, windowMs: 60 * MINUTE },
  // Every API call from one IP, as a ceiling against scripted floods.
  api: { limit: 300, windowMs: MINUTE },
  // Anyone can type anyone's address into the form: at most this many request emails reach one inbox.
  emailRecipient: { limit: 3, windowMs: 60 * MINUTE },
  // Analytics reports from the website: plenty for a real visit, and a site-wide ceiling.
  events: { limit: 60, windowMs: MINUTE },
  eventsGlobal: { limit: 20_000, windowMs: 60 * MINUTE },
  // Starting and finishing "Sign in with Google".
  googleSignIn: { limit: 30, windowMs: 10 * MINUTE },
}
const EVERYONE = '*'
const FAILED_LOGIN_DELAY_MS = 400
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
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
  const db = openDb(config.dataDir)
  const activity = createActivityLog(db)
  // Every audit line goes to the host's logs; staff actions (admin.*) are also kept in the
  // database so the console's Activity page and each booking's history can show them.
  const audit = (event, fields) => {
    log(`[audit] ${new Date().toISOString()} ${event} ${Object.entries(fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}`)
    // Blocked CSRF and rate-limited sign-ins can be triggered by anyone, as often as they like,
    // so they stay in the host's logs only and cannot flood the database.
    if (!event.startsWith('admin.') || event === 'admin.csrf_blocked' || event === 'admin.login_blocked') return
    const { ip = null, reference = null, from, to, rows, via } = fields
    const detail = from !== undefined ? `${from} → ${to}` : rows !== undefined ? `${rows} booking${rows === 1 ? '' : 's'}` : (via ?? '')
    try {
      activity.record(event.slice('admin.'.length), { reference, detail, ip })
    } catch (err) {
      console.error('[audit] could not store event:', err)
    }
  }
  const bookings = createBookingStore(db)
  const analytics = createAnalytics(db)
  const payments = createPaymentStore(db)
  const provider = config.payments ? createStripe(config.payments, options.paymentFetch) : null
  /*
   * Booking events other parts of the server can react to (confirmation emails, for one).
   *   'payment.received'  (booking)  a deposit was paid; fired exactly once per booking
   *   'payment.refunded'  (booking)  the deposit was refunded in full from the Stripe dashboard
   * `booking` is the full booking as the admin API returns it, including booking.payment.
   * A listener that throws is logged and never breaks the request that triggered it.
   */
  const events = new EventEmitter()
  const emit = (name, booking) => {
    for (const listener of events.listeners(name)) {
      try {
        const result = listener(booking)
        if (result && typeof result.catch === 'function') result.catch((err) => console.error(`[events] ${name} listener failed:`, err))
      } catch (err) {
        console.error(`[events] ${name} listener failed:`, err)
      }
    }
  }
  const sessions = createSessionStore(db, { hours: config.sessionHours, secret: config.adminSecret })
  const accounts = createAccountStore(db)
  const google = createGoogleAuth({ clientId: config.googleClientId, clientSecret: config.googleClientSecret, fetchImpl: config.fetch })
  const adminGoogle = Boolean(google && config.adminGoogleEmails.size)

  const limits = { ...DEFAULT_LIMITS, ...config.limits }
  const limiters = Object.fromEntries(Object.entries(limits).map(([name, opts]) => [name, new RateLimiter(opts)]))

  // ---- Emails: sent in the background after the response, so a slow provider never delays anyone ----
  const mailer = options.mailer ?? createMailer(config.email, { log })
  if (config.emailProblem) console.warn(`[email] ${config.emailProblem}`)
  const emailOptions = { siteUrl: config.siteUrl, canReply: Boolean(config.email?.replyTo) }
  const sendEmail = (to, message, tag) => {
    if (!mailer.enabled || !to) return
    mailer.send({ to, ...message, tag }).catch((err) => console.error('[email] failed:', err))
  }
  const emailGuest = (booking, template, tag) => {
    if (!limiters.emailRecipient.hit(booking.email).ok) return audit('email.recipient_capped', { reference: booking.reference })
    sendEmail(booking.email, template(booking, emailOptions), `${tag} ${booking.reference}`)
  }
  // Deposit receipts. These fire once per booking, only when Stripe is set up as well.
  for (const [event, template, tag] of [['payment.received', depositReceived, 'deposit-received'], ['payment.refunded', depositRefunded, 'deposit-refunded']]) {
    events.on(event, (booking) => {
      if (!booking?.payment?.amount) return
      const amount = formatMoney(booking.payment.amount, booking.payment.currency)
      sendEmail(booking.email, template(booking, { ...emailOptions, amount }), `${tag} ${booking.reference}`)
    })
  }

  // ---- Housekeeping: forget old bookings and expired sessions, at start and once a day ----
  const retention = () => {
    try {
      const removed = bookings.purge(config.retentionDays)
      const expired = sessions.purgeExpired()
      accounts.purge(config.retentionDays)
      activity.purge(config.retentionDays)
      analytics.purge(config.retentionDays)
      if (removed || expired) log(`[retention] removed ${removed} booking(s) older than ${config.retentionDays} days, ${expired} expired session(s)`)
    } catch (err) {
      console.error('[retention] failed:', err)
    }
  }
  retention()
  const timers = [
    setInterval(retention, DAY),
    setInterval(() => {
      Object.values(limiters).forEach((l) => l.sweep())
      google?.sweep()
    }, MINUTE),
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
  // Nothing whose name starts with a dot is ever served (.env, .git, editor files), and scanners
  // probing for them get a plain 404 instead of the site's page. /.well-known stays open.
  app.use((req, res, next) => {
    let path
    try {
      path = decodeURIComponent(req.path)
    } catch {
      return res.status(400).type('text').send('Bad request.')
    }
    if (/(^|[\\/])\.(?!well-known(\/|$))/.test(path)) return res.status(404).type('text').send('Not found.')
    next()
  })
  // Gzip every text response (JS, CSS, HTML, JSON): the main 3D bundle drops from 1.2 MB to about 370 KB.
  app.use(compression())
  app.use(['/api', '/admin', '/auth'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use('/api', rateLimit(limiters.api))

  // Stripe signs the exact bytes it sends, so this one route reads the raw body,
  // before the JSON parser below gets to it.
  app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '256kb' }), (req, res) => {
    if (!provider || !config.payments.webhookSecret) return res.status(404).json({ error: 'Not found.' })
    if (!provider.webhookSignatureValid(req.body, req.headers['stripe-signature'])) {
      audit('payment.webhook_bad_signature', { ip: req.ip })
      return res.status(400).json({ error: 'Bad signature.' })
    }
    let event
    try {
      event = JSON.parse(req.body.toString('utf8'))
    } catch {
      return res.status(400).json({ error: 'Malformed JSON.' })
    }
    const update = provider.parseWebhook(event)
    if (update?.kind === 'paid') paid(update, 'webhook')
    else if (update?.kind === 'refunded') refunded(update.paymentId)
    // Anything else (other events, bookings this site no longer has) is acknowledged and ignored,
    // so Stripe does not keep retrying it.
    res.json({ received: true })
  })

  // Only real JSON objects or arrays, at most 10 KB; anything else is never parsed.
  app.use(express.json({ limit: '10kb', strict: true, type: 'application/json' }))

  // ---- Public API: what the website calls ----

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  // Visitor analytics: the website reports page views, sections reached, cars opened and booking
  // starts. Always 204, so a report that is ignored (bot, staff, over a limit) looks like any other.
  app.post('/api/events', rateLimit(limiters.events), (req, res) => {
    if (!sameOrigin(req)) return res.status(204).end()
    const event = analytics.parse(req.body)
    if (!event) return res.status(400).json({ error: 'Unknown event.' })
    if (countable(req) && limiters.eventsGlobal.hit(EVERYONE).ok) {
      try {
        analytics.record(req, event)
      } catch (err) {
        console.error('[analytics] could not store event:', err)
      }
    }
    res.status(204).end()
  })

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
    const site = limiters.bookingsGlobal.hit(EVERYONE)
    if (!site.ok) {
      audit('spam.bookings_capped', { ip: req.ip })
      return tooMany(res, site.retryAfter, 'We are receiving an unusual number of requests. Please try again a little later.')
    }
    // The form checks availability too, but only the server's answer counts:
    // two people can submit the same car and dates at the same moment.
    if (input.vehicleId && !bookings.isAvailable(input.vehicleId, input.pickup, input.returnDate))
      return res.status(409).json({ error: 'That car is already booked for those dates. Try other dates or let us advise.' })
    const { note: _note, updatedAt: _updatedAt, ...created } = bookings.createBooking(input)
    trackBooking(req, created.vehicleId)
    res.status(201).json(created)
    emailGuest(created, bookingReceived, 'request-received')
    sendEmail(config.ownerEmail, ownerNewBooking(created, emailOptions), `owner-new-request ${created.reference}`)
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
    res.json(summary(booking))
  })

  // ---- Online deposit (Stripe Checkout). Every route answers 404 until the key is set. ----

  // Payments also show in the booking's history in the console.
  const recordPayment = (event, reference, detail) => {
    try {
      activity.record(event, { reference, detail, ip: null })
    } catch (err) {
      console.error('[payments] could not store event:', err)
    }
  }
  /** Marks a booking paid from a session Stripe says is paid. Only the first call records and announces it. */
  const paid = (session, via) => {
    const expected = payments.expected(session.reference)
    if (!expected) return false
    // The figure comes from Stripe, but it must be the deposit this server asked for.
    if (session.amount !== expected.amount || session.currency !== expected.currency) {
      audit('payment.amount_mismatch', { reference: session.reference, expected: `${expected.amount} ${expected.currency}`, got: `${session.amount} ${session.currency}` })
      return false
    }
    if (!payments.markPaid(session.reference, session.sessionId, session.paymentId)) return true
    const booking = bookings.findBooking(session.reference)
    const amount = formatMoney(booking.payment.amount, booking.payment.currency)
    audit('payment.received', { reference: booking.reference, amount, via })
    recordPayment('payment_received', booking.reference, amount)
    emit('payment.received', booking)
    return true
  }
  const refunded = (paymentId) => {
    const reference = payments.markRefunded(paymentId)
    if (!reference) return
    audit('payment.refunded', { reference })
    recordPayment('payment_refunded', reference, '')
    emit('payment.refunded', bookings.findBooking(reference))
  }
  const paymentsOff = (_req, res, next) => (provider ? next() : res.status(404).json({ error: 'Online payment is not available.' }))
  const paymentLimit = rateLimit(limiters.payments, 'Too many payment attempts. Please wait a few minutes and try again.')
  const summary = (b) => ({
    reference: b.reference,
    vehicle: b.vehicle,
    city: b.city,
    pickup: b.pickup,
    returnDate: b.returnDate,
    status: b.status,
    payment: { status: b.payment.status, amount: b.payment.amount, currency: b.payment.currency },
  })

  // What the website needs to offer the deposit.
  app.get('/api/payments/config', (_req, res) => {
    if (!provider) return res.json({ enabled: false })
    const { provider: name, amount, currency, test } = config.payments
    res.json({ enabled: true, provider: name, amount, currency, test })
  })

  // Starts a deposit for one booking and returns Stripe's payment page. Like the status lookup,
  // it needs the reference and the email together. The amount is the server's own setting.
  app.post('/api/payments/checkout', paymentsOff, paymentLimit, async (req, res) => {
    const { reference, email } = req.body ?? {}
    if (!isString(reference) || !isString(email) || !reference.trim() || !email.trim() || reference.length > LIMITS.reference || email.length > LIMITS.email)
      return res.status(404).json(NO_MATCH)
    const booking = bookings.lookup(reference, email)
    if (!booking) return res.status(404).json(NO_MATCH)
    if (booking.status === 'cancelled') return res.status(409).json({ error: 'This booking was cancelled, so there is nothing to pay.' })
    if (booking.payment.status !== 'none') return res.status(409).json({ error: 'The deposit for this booking is already paid.' })
    const { amount, currency, siteUrl } = config.payments
    const site = siteUrl || config.siteUrl || `${req.protocol}://${req.get('host')}`
    const ref = encodeURIComponent(booking.reference)
    try {
      const { sessionId, url } = await provider.createCheckout({
        reference: booking.reference,
        email: booking.email,
        amount,
        currency,
        description: `Reservation deposit, ${booking.vehicle ?? 'Velocé'} (${booking.reference})`,
        // Stripe fills in {CHECKOUT_SESSION_ID} itself.
        successUrl: `${site}/?payment=done&session_id={CHECKOUT_SESSION_ID}#manage`,
        cancelUrl: `${site}/?payment=cancelled&ref=${ref}#manage`,
      })
      payments.saveCheckout(booking.reference, sessionId, amount, currency)
      res.json({ url })
    } catch (err) {
      console.error('[payments] checkout failed:', err?.message ?? err)
      res.status(502).json({ error: 'The payment page could not be opened. Please try again in a moment.' })
    }
  })

  // The guest is back from Stripe. The server asks Stripe itself; the browser's word is not enough.
  // The session id is a long secret only the payer's browser holds.
  app.post('/api/payments/confirm', paymentsOff, paymentLimit, async (req, res) => {
    const { sessionId } = req.body ?? {}
    if (!isString(sessionId) || !/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return res.status(404).json({ error: 'Payment not found.' })
    let session
    try {
      session = await provider.getCheckout(sessionId)
    } catch (err) {
      console.error('[payments] confirm failed:', err?.message ?? err)
      return res.status(502).json({ error: 'We could not check the payment just now. Your booking is safe; check its status again in a minute.' })
    }
    if (!session.reference || !bookings.findBooking(session.reference)) return res.status(404).json({ error: 'Payment not found.' })
    if (session.paid) paid(session, 'return')
    res.json(summary(bookings.findBooking(session.reference)))
  })

  // ---- Concierge admin: password sign-in with a server-side session ----

  const loggedIn = (req) => sessions.valid(sessionId(req))
  // Bots, and staff looking at their own site while signed in, are left out of the numbers.
  const countable = (req) => !isBot(String(req.headers['user-agent'] ?? '')) && !loggedIn(req)
  function trackBooking(req, vehicleId) {
    if (!countable(req)) return
    try {
      analytics.record(req, { kind: 'booking', name: vehicleId ?? 'none' })
    } catch (err) {
      console.error('[analytics] could not store booking:', err)
    }
  }
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

  // ---- The console: a separate site for staff only, never linked from the public pages ----
  // Search engines are told to stay out, and nothing under /admin is cached by the browser or a proxy.
  app.use('/admin', (_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
    next()
  })
  app.get('/admin', (req, res) => (loggedIn(req) ? res.sendFile(here('./admin.html')) : res.redirect(303, '/admin/login')))
  app.get('/admin/login', (req, res) => (loggedIn(req) ? res.redirect(303, '/admin') : res.sendFile(here('./login.html'))))
  // The sign-in page's own CSS and JS are the only admin files anyone may load.
  for (const file of ['login.css', 'login.js']) app.get(`/admin/${file}`, (_req, res) => res.sendFile(here(`./public/${file}`)))
  // The console's code is served only inside a valid session: visitors get a plain 404,
  // so they cannot even read how the console works.
  app.use('/admin/console', (req, res, next) => (loggedIn(req) ? next() : res.status(404).type('text').send('Not found.')))
  app.use('/admin/console', express.static(here('./console/'), { index: false, maxAge: 0, fallthrough: false }))
  app.use('/admin', (_req, res) => res.status(404).type('text').send('Not found.'))

  app.post('/api/admin/login', guardWrite, async (req, res) => {
    const ip = req.ip ?? 'unknown'
    const wait = limiters.loginFailures.blocked(ip) ?? limiters.loginFailuresGlobal.blocked(EVERYONE)
    if (wait) {
      audit('admin.login_blocked', { ip })
      return tooMany(res, wait, 'Too many failed sign-ins. Try again later.')
    }
    if (!passwordMatches(req.body?.password, config.adminSecret)) {
      limiters.loginFailures.hit(ip)
      limiters.loginFailuresGlobal.hit(EVERYONE)
      // Logged once, on the failure that locks sign-in for everyone until the window ends.
      if (limiters.loginFailuresGlobal.blocked(EVERYONE)) audit('admin.login_locked', { ip })
      audit('admin.login_failed', { ip })
      // A short pause makes every wrong guess slower, on top of the counters above.
      await sleep(FAILED_LOGIN_DELAY_MS)
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

  app.get('/api/admin/session', (req, res) => {
    const expiresAt = sessions.expiresAt(sessionId(req))
    res.json(
      expiresAt
        ? { authenticated: true, expiresAt: new Date(expiresAt).toISOString(), demoPassword: config.usingDevPassword, vehicles, cities }
        : { authenticated: false, google: adminGoogle },
    )
  })
  app.get('/api/admin/bookings', requireAdmin, (_req, res) => res.json(bookings.listBookings()))

  // Visitor analytics for the console. ?days=7|30|90
  app.get('/api/admin/analytics', requireAdmin, (req, res) => {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30
    res.json(analytics.summary(days))
  })

  // Activity log: sign-ins and every change made in the console, newest first. ?limit=1..500
  app.get('/api/admin/activity', requireAdmin, (req, res) => res.json(activity.recent(Number.parseInt(req.query.limit, 10) || 200)))
  app.get('/api/admin/bookings/:reference/history', requireAdmin, (req, res) => {
    const reference = req.params.reference.toUpperCase()
    if (reference.length > LIMITS.reference) return res.status(404).json({ error: 'Booking not found.' })
    res.json(activity.forBooking(reference))
  })

  // Spreadsheet export. Cells that start like a formula are prefixed so Excel shows them as text.
  app.get('/api/admin/bookings.csv', requireAdmin, (req, res) => {
    const cols = [
      ['Reference', 'reference'], ['Status', 'status'], ['Guest', 'name'], ['Email', 'email'], ['Car', 'vehicle'],
      ['City', 'city'], ['Pick-up', 'pickup'], ['Return', 'returnDate'], ['Received (UTC)', 'createdAt'], ['Deposit', 'deposit'], ['Note', 'note'],
    ]
    const cell = (v) => {
      let text = String(v ?? '')
      if (/^[=+\-@\t\r]/.test(text)) text = "'" + text
      return `"${text.replace(/"/g, '""')}"`
    }
    const lines = [cols.map(([h]) => cell(h)).join(','), ...bookings.listBookings().map((b) => cols.map(([, k]) => cell(k === 'deposit' ? depositText(b.payment) : b[k])).join(','))]
    audit('admin.export', { ip: req.ip, rows: lines.length - 1 })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="veloce-bookings-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.send('\ufeff' + lines.join('\r\n'))
  })

  // Change the status and/or the staff note of one booking.
  app.patch('/api/admin/bookings/:reference', requireAdmin, guardWrite, (req, res) => {
    const reference = req.params.reference.toUpperCase()
    const body = req.body ?? {}
    if (reference.length > LIMITS.reference) return res.status(404).json({ error: 'Booking not found.' })
    if (body.status === undefined && body.note === undefined) return res.status(400).json({ error: 'Nothing to change.' })
    const fail = (result) => res.status(result.invalid ? 400 : result.notFound ? 404 : 409).json({ error: result.error })
    let booking
    if (body.status !== undefined) {
      const result = bookings.updateStatus(reference, body.status)
      if (result.error) return fail(result)
      if (result.previous !== body.status) {
        audit('admin.status_change', { ip: req.ip, reference, from: result.previous, to: body.status })
        // Staff decide when these go out, so they skip the per-inbox cap that guards the public form.
        const template = { confirmed: bookingConfirmed, cancelled: bookingCancelled }[body.status]
        if (template) sendEmail(result.booking.email, template(result.booking, emailOptions), `booking-${body.status} ${reference}`)
      }
      booking = result.booking
    }
    if (body.note !== undefined) {
      const result = bookings.updateNote(reference, body.note)
      if (result.error) return fail(result)
      audit('admin.note_saved', { ip: req.ip, reference })
      booking = result.booking
    }
    res.json(booking)
  })

  // Erase a booking and the guest's personal details.
  app.delete('/api/admin/bookings/:reference', requireAdmin, guardWrite, (req, res) => {
    const reference = req.params.reference.toUpperCase()
    if (reference.length > LIMITS.reference || !bookings.deleteBooking(reference)) return res.status(404).json({ error: 'Booking not found.' })
    audit('admin.booking_deleted', { ip: req.ip, reference })
    res.json({ ok: true })
  })

  // ---- Sign in with Google: guests on the public site and, when allowed, staff ----

  const OAUTH_COOKIE = 'veloce_oauth'
  const oauthCookie = (req) => (req.secure ? `__Host-${OAUTH_COOKIE}` : OAUTH_COOKIE)
  const oauthCookieOptions = (req) => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' })
  // Must match an "Authorised redirect URI" in Google Cloud Console exactly. A forged Host header
  // cannot abuse this: Google refuses any redirect URI that is not registered.
  const redirectUri = (req) => `${req.protocol}://${req.get('host')}${CALLBACK_PATH}`

  // A tiny page that moves on to `to`. A plain redirect would not do: the visitor arrives here from
  // accounts.google.com, and browsers hold back SameSite=Strict cookies for the rest of a redirect
  // chain that started on another site. A page of our own starts a fresh, same-site navigation.
  const continueTo = (res, to) => {
    const href = escapeAttr(to)
    res
      .type('html')
      .send(`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${href}"><title>Signing in</title><a href="${href}">Continue</a>`)
  }

  app.get('/auth/google', rateLimit(limiters.googleSignIn, 'Too many sign-in attempts. Please wait a few minutes.'), (req, res) => {
    const purpose = req.query.for === 'admin' ? 'admin' : 'guest'
    if (!google || (purpose === 'admin' && !adminGoogle)) return res.redirect(303, purpose === 'admin' ? '/admin/login' : '/')
    const returnTo = purpose === 'admin' ? '/admin' : safeReturnPath(req.query.return)
    const { url, state } = google.begin({ purpose, returnTo, redirectUri: redirectUri(req) })
    // SameSite=Lax, not Strict: it must come back with Google's redirect, a cross-site navigation.
    res.cookie(oauthCookie(req), state, { ...oauthCookieOptions(req), maxAge: 10 * MINUTE })
    res.redirect(303, url)
  })

  app.get(CALLBACK_PATH, rateLimit(limiters.googleSignIn, 'Too many sign-in attempts. Please wait a few minutes.'), async (req, res) => {
    const flow = google?.take(req.query.state, parseCookies(req.headers.cookie)[oauthCookie(req)])
    res.clearCookie(oauthCookie(req), oauthCookieOptions(req))
    if (!flow) return continueTo(res, '/?signin=expired')
    const back = (outcome) => (flow.purpose === 'admin' ? `/admin/login?google=${outcome}` : withParam(flow.returnTo, 'signin', outcome))
    if (req.query.error || !isString(req.query.code)) return continueTo(res, back('cancelled'))

    let who
    try {
      who = await google.finish(flow, req.query.code)
    } catch (err) {
      log(`[google] sign-in failed: ${err.message}`)
      return continueTo(res, back('failed'))
    }

    if (flow.purpose === 'admin') {
      // Same counters as the password form, so Google cannot be used to get round them.
      const ip = req.ip ?? 'unknown'
      const wait = limiters.loginFailures.blocked(ip) ?? limiters.loginFailuresGlobal.blocked(EVERYONE)
      if (wait) {
        audit('admin.login_blocked', { ip })
        return continueTo(res, back('locked'))
      }
      if (!config.adminGoogleEmails.has(who.email)) {
        limiters.loginFailures.hit(ip)
        limiters.loginFailuresGlobal.hit(EVERYONE)
        audit('admin.login_failed', { ip, email: who.email, via: 'Google account not on the staff list' })
        return continueTo(res, back('denied'))
      }
      limiters.loginFailures.reset(ip)
      setSessionCookie(req, res, sessions.create(), sessions.ttl)
      audit('admin.login_ok', { ip, via: `Google (${who.email})` })
      return continueTo(res, '/admin')
    }

    setGuestCookie(req, res, accounts.signIn(who), accounts.ttl)
    audit('guest.login', { ip: req.ip })
    continueTo(res, flow.returnTo)
  })

  // ---- Guest account: who is signed in, and their bookings ----

  const guest = (req) => accounts.current(guestSessionId(req))

  app.get('/api/account', (req, res) => {
    const me = guest(req)
    res.json({ google: Boolean(google), user: me ? { name: me.name, email: me.email } : null })
  })

  // Every booking made with the guest's Google-verified email, including ones made before they signed in.
  app.get('/api/account/bookings', (req, res) => {
    const me = guest(req)
    if (!me) return res.status(401).json({ error: 'Please sign in.' })
    res.json(
      accounts.bookings(me.email).map((row) => ({
        reference: row.reference,
        vehicle: row.vehicle_id ? (vehicles[row.vehicle_id] ?? null) : null,
        city: cities[row.city_id] ?? row.city_id,
        pickup: row.pickup,
        returnDate: row.return_date,
        status: row.status,
      })),
    )
  })

  app.post('/api/account/logout', guardWrite, (req, res) => {
    accounts.signOut(guestSessionId(req))
    clearGuestCookie(req, res)
    res.json({ ok: true })
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
    events,
    close() {
      timers.forEach(clearInterval)
      db.close()
    },
  }
}

const escapeAttr = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Adds ?key=value to a path, keeping any #hash at the end. */
function withParam(path, key, value) {
  const i = path.indexOf('#')
  const [base, hash] = i < 0 ? [path, ''] : [path.slice(0, i), path.slice(i)]
  return `${base}${base.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}${hash}`
}
const depositText = (p) => (p.status === 'none' ? '' : `${p.status} ${formatMoney(p.amount, p.currency)}`)

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
    payment: { status: 'none', amount: null, currency: null, paymentId: null, paidAt: null },
    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }
}
