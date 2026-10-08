// Online deposits for bookings, through Razorpay Payment Links (Razorpay's own hosted payment
// page, with cards, UPI, netbanking and wallets). Everything that knows about the payment provider
// lives in this file, so switching provider means replacing createRazorpay() and keeping its methods.
// Razorpay docs: https://razorpay.com/docs/api/payments/payment-links/ and https://razorpay.com/docs/webhooks/
//
// How a payment flows:
//   1. The guest's browser asks POST /api/payments/checkout for a payment page. The server alone
//      decides the amount (PAYMENT_DEPOSIT), creates a payment link at Razorpay tagged with the
//      booking reference, and sends the browser there. Card and UPI details never touch this site.
//   2. Razorpay sends the guest back to /api/payments/return, which forwards to /?session_id=...#manage.
//      The site asks POST /api/payments/confirm, and the server asks Razorpay directly whether that
//      link is paid.
//   3. Razorpay also calls POST /api/payments/webhook, signed with the webhook secret, which covers
//      a guest who closes the tab before step 2.
//   Whichever of 2 and 3 arrives first marks the booking paid; the other changes nothing.
import { createHmac, timingSafeEqual } from 'node:crypto'

const API = 'https://api.razorpay.com/v1'
const KEY_ID = /^rzp_(test|live)_[A-Za-z0-9]+$/
// Currencies counted in whole units rather than hundredths.
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])
export const PAYMENT_STATUSES = ['none', 'paid', 'refunded']

const sameHex = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Smallest-unit amount (paise, cents) as a plain figure such as "5000.00 INR". */
export const formatMoney = (amount, currency) =>
  `${ZERO_DECIMAL.has(currency) ? String(amount) : (amount / 100).toFixed(2)} ${currency}`

/**
 * Reads the payment settings from the environment. Payments stay switched off (and booking
 * works without them) until RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are both set. Returns null
 * when off; throws an Error with a plain message when the settings are unusable.
 */
export function paymentSettings(env, overrides = {}) {
  const keyId = (overrides.keyId ?? env.RAZORPAY_KEY_ID)?.trim() || ''
  const keySecret = (overrides.keySecret ?? env.RAZORPAY_KEY_SECRET)?.trim() || ''
  const webhookSecret = (overrides.webhookSecret ?? env.RAZORPAY_WEBHOOK_SECRET)?.trim() || ''
  if (!keyId && !keySecret) return null
  if (!keyId || !keySecret) throw new Error('Set both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or neither.')
  if (!KEY_ID.test(keyId)) throw new Error('RAZORPAY_KEY_ID should start with rzp_test_ or rzp_live_ (copy it from the Razorpay dashboard, Account & Settings, API Keys).')
  if (KEY_ID.test(keySecret)) throw new Error('RAZORPAY_KEY_SECRET holds the key id. Use the Key Secret shown next to it when the key was generated.')
  const currency = String(overrides.currency ?? env.PAYMENT_CURRENCY ?? 'INR').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('PAYMENT_CURRENCY must be a three-letter code such as INR or USD.')
  const deposit = Number(overrides.deposit ?? env.PAYMENT_DEPOSIT ?? 5000)
  if (!Number.isFinite(deposit) || deposit < 1 || deposit > 500000)
    throw new Error('PAYMENT_DEPOSIT must be a number between 1 and 500000, in whole rupees, dollars and so on.')
  // Where Razorpay sends the guest back to. Optional: without it, SITE_URL / RENDER_EXTERNAL_URL.
  const siteUrl = (overrides.siteUrl ?? env.SITE_URL)?.trim().replace(/\/+$/, '') || ''
  if (siteUrl && !/^https?:\/\/[^/\s]+$/.test(siteUrl)) throw new Error('SITE_URL must be the site address only, like https://veloce.onrender.com')
  return {
    provider: 'razorpay',
    keyId,
    keySecret,
    webhookSecret,
    currency,
    amount: ZERO_DECIMAL.has(currency) ? Math.round(deposit) : Math.round(deposit * 100),
    siteUrl,
    test: keyId.startsWith('rzp_test_'),
  }
}

/** The Razorpay calls the server needs. `fetchImpl` lets tests stand in for the real API. */
export function createRazorpay(settings, fetchImpl = fetch) {
  const auth = 'Basic ' + Buffer.from(`${settings.keyId}:${settings.keySecret}`).toString('base64')
  const call = async (method, path, body) => {
    const res = await fetchImpl(`${API}${path}`, {
      method,
      headers: { Authorization: auth, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Razorpay ${method} ${path.split('/').slice(0, 2).join('/')} failed: ${data?.error?.description ?? `HTTP ${res.status}`}`)
    return data
  }
  /** A payment link as the app sees it. */
  const link = (l) => {
    const payment = (l.payments ?? []).find((p) => p.status === 'captured') ?? null
    return {
      sessionId: l.id,
      reference: l.notes?.reference ?? null,
      paid: l.status === 'paid',
      paymentId: payment?.payment_id ?? null,
      amount: Number(l.status === 'paid' ? l.amount_paid : l.amount),
      currency: String(l.currency ?? '').toUpperCase(),
    }
  }

  return {
    /** The header Razorpay puts its webhook signature in. */
    signatureHeader: 'x-razorpay-signature',
    /** What a payment link id looks like, so made-up ids are refused before any API call. */
    sessionIdPattern: /^plink_[A-Za-z0-9]{6,40}$/,

    /** A Razorpay-hosted payment page for one booking's deposit. Returns { sessionId, url }. */
    async createCheckout({ reference, name, email, amount, currency, returnUrl, description }) {
      const l = await call('POST', '/payment_links', {
        amount,
        currency,
        description: description.slice(0, 2048),
        // Must be unique per link; the booking reference itself travels in notes.
        reference_id: `${reference}-${Date.now().toString(36)}`,
        customer: { name, email },
        // The site sends its own emails; Razorpay should not text or mail the guest a link.
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { reference },
        callback_url: returnUrl,
        callback_method: 'get',
      })
      return { sessionId: l.id, url: l.short_url }
    },

    /** Asks Razorpay for a payment link's current state. */
    async getCheckout(sessionId) {
      return link(await call('GET', `/payment_links/${encodeURIComponent(sessionId)}`))
    },

    /** Razorpay signs the raw webhook body: hex HMAC-SHA256 with the webhook secret. */
    webhookSignatureValid(rawBody, signature) {
      if (!settings.webhookSecret || !Buffer.isBuffer(rawBody) || typeof signature !== 'string') return false
      return sameHex(createHmac('sha256', settings.webhookSecret).update(rawBody).digest('hex'), signature)
    },

    /**
     * Turns a verified webhook body into what the app cares about, or null for events it ignores:
     * { kind: 'paid', reference, sessionId, paymentId, amount, currency } or { kind: 'refunded', paymentId }
     */
    parseWebhook(event) {
      const payload = event?.payload
      if (!payload || typeof payload !== 'object') return null
      if (event.event === 'payment_link.paid') {
        const l = payload.payment_link?.entity
        const payment = payload.payment?.entity
        if (!l || typeof l.id !== 'string') return null
        const s = link(l)
        return s.paid && s.reference ? { kind: 'paid', ...s, paymentId: payment?.id ?? s.paymentId } : null
      }
      // Only a full refund counts; a partial one leaves the deposit marked paid.
      const payment = payload.payment?.entity
      if (event.event === 'refund.processed' && typeof payment?.id === 'string' && Number(payment.amount_refunded) >= Number(payment.amount))
        return { kind: 'refunded', paymentId: payment.id }
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
