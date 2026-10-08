// Online deposits for bookings, through Stripe Checkout (Stripe's own hosted payment page).
// Everything that knows about the payment provider lives in this file, so switching provider
// means replacing createStripe() and keeping its four methods.
// Stripe docs: https://docs.stripe.com/checkout/quickstart and https://docs.stripe.com/webhooks
//
// How a payment flows:
//   1. The guest's browser asks POST /api/payments/checkout for a payment page. The server alone
//      decides the amount (PAYMENT_DEPOSIT), creates a Checkout Session at Stripe tagged with the
//      booking reference, and sends the browser to Stripe's page. Card details never touch this site.
//   2. Stripe sends the guest back to /?session_id=...#manage. The site asks POST /api/payments/confirm,
//      and the server asks Stripe directly whether that session is paid.
//   3. Stripe also calls POST /api/payments/webhook, signed with the webhook secret, which covers
//      a guest who closes the tab before step 2.
//   Whichever of 2 and 3 arrives first marks the booking paid; the other changes nothing.
import { createHmac, timingSafeEqual } from 'node:crypto'

const API = 'https://api.stripe.com/v1'
const SECRET_KEY = /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/
// Stripe's default tolerance: a signed webhook older than five minutes is refused (replay protection).
const WEBHOOK_TOLERANCE_S = 300
// Currencies Stripe counts in whole units rather than hundredths.
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])
export const PAYMENT_STATUSES = ['none', 'paid', 'refunded']

const sameHex = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Smallest-unit amount (cents, paise) as a plain figure such as "500.00 USD". */
export const formatMoney = (amount, currency) =>
  `${ZERO_DECIMAL.has(currency) ? String(amount) : (amount / 100).toFixed(2)} ${currency}`

/**
 * Reads the payment settings from the environment. Payments stay switched off (and booking
 * works without them) until STRIPE_SECRET_KEY is set. Returns null when off; throws an Error
 * with a plain message when the settings are unusable.
 */
export function paymentSettings(env, overrides = {}) {
  const secretKey = (overrides.secretKey ?? env.STRIPE_SECRET_KEY)?.trim() || ''
  const webhookSecret = (overrides.webhookSecret ?? env.STRIPE_WEBHOOK_SECRET)?.trim() || ''
  if (!secretKey) return null
  if (secretKey.startsWith('pk_')) throw new Error('STRIPE_SECRET_KEY holds the publishable key (pk_...). Use the secret key, which starts with sk_test_ or sk_live_.')
  if (!SECRET_KEY.test(secretKey)) throw new Error('STRIPE_SECRET_KEY should start with sk_test_ or sk_live_ (copy it from the Stripe dashboard, Developers, API keys).')
  if (webhookSecret && !webhookSecret.startsWith('whsec_')) throw new Error('STRIPE_WEBHOOK_SECRET should start with whsec_ (the signing secret shown on the webhook endpoint in Stripe).')
  const currency = String(overrides.currency ?? env.PAYMENT_CURRENCY ?? 'USD').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('PAYMENT_CURRENCY must be a three-letter code such as USD or INR.')
  const deposit = Number(overrides.deposit ?? env.PAYMENT_DEPOSIT ?? 500)
  if (!Number.isFinite(deposit) || deposit < 1 || deposit > 500000)
    throw new Error('PAYMENT_DEPOSIT must be a number between 1 and 500000, in whole dollars, rupees and so on.')
  // Where Stripe sends the guest back to. Optional: without it, the address the guest is using.
  const siteUrl = (overrides.siteUrl ?? env.SITE_URL)?.trim().replace(/\/+$/, '') || ''
  if (siteUrl && !/^https?:\/\/[^/\s]+$/.test(siteUrl)) throw new Error('SITE_URL must be the site address only, like https://veloce.onrender.com')
  return {
    provider: 'stripe',
    secretKey,
    webhookSecret,
    currency,
    amount: ZERO_DECIMAL.has(currency) ? Math.round(deposit) : Math.round(deposit * 100),
    siteUrl,
    test: secretKey.includes('_test_'),
  }
}

/** Stripe's API takes form-encoded bodies with bracketed keys: a[b][c]=value. */
function formEncode(value, prefix = '', out = new URLSearchParams()) {
  if (value === undefined || value === null) return out
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) formEncode(v, prefix ? `${prefix}[${k}]` : k, out)
  } else {
    out.append(prefix, String(value))
  }
  return out
}

/** The Stripe calls the server needs. `fetchImpl` lets tests stand in for the real API. */
export function createStripe(settings, fetchImpl = fetch) {
  const call = async (method, path, body) => {
    const res = await fetchImpl(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${settings.secretKey}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: body ? formEncode(body).toString() : undefined,
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Stripe ${method} ${path.split('/').slice(0, 3).join('/')} failed: ${data?.error?.message ?? `HTTP ${res.status}`}`)
    return data
  }
  const session = (s) => ({
    sessionId: s.id,
    reference: s.metadata?.reference ?? s.client_reference_id ?? null,
    paid: s.payment_status === 'paid',
    paymentId: typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? null),
    amount: Number(s.amount_total),
    currency: String(s.currency ?? '').toUpperCase(),
  })

  return {
    /** A Stripe-hosted payment page for one booking's deposit. Returns { sessionId, url }. */
    async createCheckout({ reference, email, amount, currency, successUrl, cancelUrl, description }) {
      const s = await call('POST', '/checkout/sessions', {
        mode: 'payment',
        line_items: { 0: { quantity: 1, price_data: { currency: currency.toLowerCase(), unit_amount: amount, product_data: { name: description } } } },
        customer_email: email,
        client_reference_id: reference,
        metadata: { reference },
        payment_intent_data: { metadata: { reference }, description },
        success_url: successUrl,
        cancel_url: cancelUrl,
      })
      return { sessionId: s.id, url: s.url }
    },

    /** Asks Stripe for a session's current state. */
    async getCheckout(sessionId) {
      return session(await call('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`))
    },

    /**
     * Stripe-Signature is "t=<unix seconds>,v1=<hex>[,v1=...]", where v1 is the HMAC-SHA256 of
     * "<t>.<raw body>" with the webhook secret. `now` is in ms, for tests.
     */
    webhookSignatureValid(rawBody, header, now = Date.now()) {
      if (!settings.webhookSecret || !Buffer.isBuffer(rawBody) || typeof header !== 'string') return false
      const parts = header.split(',').map((p) => p.split('='))
      const t = Number(parts.find(([k]) => k === 't')?.[1])
      if (!Number.isInteger(t) || Math.abs(now / 1000 - t) > WEBHOOK_TOLERANCE_S) return false
      const expected = createHmac('sha256', settings.webhookSecret).update(`${t}.`).update(rawBody).digest('hex')
      return parts.some(([k, v]) => k === 'v1' && sameHex(expected, v))
    },

    /**
     * Turns a verified webhook body into what the app cares about, or null for events it ignores:
     * { kind: 'paid', reference, sessionId, paymentId, amount, currency } or { kind: 'refunded', paymentId }
     */
    parseWebhook(event) {
      const object = event?.data?.object
      if (!object || typeof object !== 'object') return null
      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const s = session(object)
        return s.paid && s.reference ? { kind: 'paid', ...s } : null
      }
      // Only a full refund counts; a partial one leaves the deposit marked paid.
      if (event.type === 'charge.refunded' && object.refunded === true && typeof object.payment_intent === 'string')
        return { kind: 'refunded', paymentId: object.payment_intent }
      return null
    },
  }
}

/** Payment columns on the bookings table, kept apart from the booking rules in bookings.js. */
export function createPaymentStore(db) {
  const setCheckout = db.prepare(
    "UPDATE bookings SET payment_order_id = ?, payment_amount = ?, payment_currency = ? WHERE reference = ? AND payment_status = 'none'",
  )
  const expected = db.prepare('SELECT payment_amount, payment_currency, payment_status FROM bookings WHERE reference = ?')
  // The WHERE clause makes each update happen at most once: a repeated webhook, or the guest's
  // return arriving after the webhook, changes no row and so announces nothing.
  const markPaid = db.prepare(
    "UPDATE bookings SET payment_status = 'paid', payment_order_id = ?, payment_id = ?, paid_at = datetime('now'), updated_at = datetime('now') WHERE reference = ? AND payment_status = 'none'",
  )
  const markRefunded = db.prepare(
    "UPDATE bookings SET payment_status = 'refunded', updated_at = datetime('now') WHERE payment_id = ? AND payment_status = 'paid' RETURNING reference",
  )

  return {
    /** Remembers the amount asked for, so the paid amount can be checked against it. */
    saveCheckout: (reference, sessionId, amount, currency) => Number(setCheckout.run(sessionId, amount, currency, reference).changes) > 0,
    expected(reference) {
      const row = expected.get(reference)
      return row ? { amount: row.payment_amount, currency: row.payment_currency, status: row.payment_status } : null
    },
    /** True only the first time a booking is marked paid. */
    markPaid: (reference, sessionId, paymentId) => Number(markPaid.run(sessionId, paymentId, reference).changes) > 0,
    /** The booking reference when this refund changed it, otherwise null. */
    markRefunded: (paymentId) => markRefunded.get(paymentId)?.reference ?? null,
  }
}
