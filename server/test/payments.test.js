// Online deposits through Stripe Checkout, with a stand-in for Stripe's API.
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { loadConfig } from '../config.js'
import { booking, postJson, start } from './helpers.js'

const WEBHOOK_SECRET = 'whsec_testsecret123'
const SETTINGS = { secretKey: 'sk_test_abc123', webhookSecret: WEBHOOK_SECRET, currency: 'USD', deposit: 500 }

/** Pretends to be api.stripe.com: remembers each session it creates; tests flip them to paid. */
function fakeStripe() {
  const sessions = new Map()
  const calls = []
  let n = 0
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname
    calls.push({ method: init.method, path, body: init.body ? new URLSearchParams(init.body) : null, auth: init.headers.Authorization })
    if (init.method === 'POST' && path === '/v1/checkout/sessions') {
      const form = new URLSearchParams(init.body)
      const id = `cs_test_session${String(++n).padStart(6, '0')}`
      const s = {
        id,
        url: `https://checkout.stripe.com/c/pay/${id}`,
        payment_status: 'unpaid',
        payment_intent: null,
        amount_total: Number(form.get('line_items[0][price_data][unit_amount]')),
        currency: form.get('line_items[0][price_data][currency]'),
        client_reference_id: form.get('client_reference_id'),
        metadata: { reference: form.get('metadata[reference]') },
      }
      sessions.set(id, s)
      return reply(200, s)
    }
    const m = path.match(/^\/v1\/checkout\/sessions\/(.+)$/)
    if (init.method === 'GET' && m) return sessions.has(m[1]) ? reply(200, sessions.get(m[1])) : reply(404, { error: { message: 'No such session' } })
    return reply(404, { error: { message: 'Unexpected call' } })
  }
  const pay = (id) => Object.assign(sessions.get(id), { payment_status: 'paid', payment_intent: `pi_${id.slice(-6)}` })
  return { fetchImpl, sessions, calls, pay }
}

const sign = (body, t = Math.floor(Date.now() / 1000), secret = WEBHOOK_SECRET) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
const webhook = (base, event, signature) => {
  const body = JSON.stringify(event)
  return fetch(`${base}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature ?? sign(body) },
    body,
  })
}
const sessionId = (url) => url.split('/').pop()

describe('payments switched off (no Stripe key)', () => {
  let srv
  before(async () => (srv = await start()))
  after(() => srv.close())

  test('the site says so, and every payment route is closed', async () => {
    assert.deepEqual(await (await fetch(`${srv.base}/api/payments/config`)).json(), { enabled: false })
    assert.equal((await postJson(`${srv.base}/api/payments/checkout`, { reference: 'VLC-X', email: 'a@b.co' })).status, 404)
    assert.equal((await postJson(`${srv.base}/api/payments/confirm`, { sessionId: 'cs_test_abcdefghijkl' })).status, 404)
    assert.equal((await webhook(srv.base, { type: 'checkout.session.completed' })).status, 404)
  })

  test('booking still works without payment', async () => {
    const res = await postJson(`${srv.base}/api/bookings`, booking())
    assert.equal(res.status, 201)
    assert.equal((await res.json()).payment.status, 'none')
  })
})

describe('payment settings', () => {
  const load = (payments) => loadConfig({}, { payments })
  test('off without a key, on with one, amount in cents', () => {
    assert.equal(loadConfig({}).payments, null)
    const p = loadConfig({ STRIPE_SECRET_KEY: 'sk_test_abc', PAYMENT_DEPOSIT: '250', PAYMENT_CURRENCY: 'usd' }).payments
    assert.equal(p.amount, 25000)
    assert.equal(p.currency, 'USD')
    assert.equal(p.test, true)
    assert.equal(load({ secretKey: 'sk_test_abc', currency: 'JPY', deposit: 5000 }).payments.amount, 5000)
  })
  test('mistakes stop the server with a plain message', () => {
    assert.throws(() => load({ secretKey: 'pk_test_abc' }), /publishable key/)
    assert.throws(() => load({ secretKey: 'hello' }), /sk_test_/)
    assert.throws(() => load({ secretKey: 'sk_test_abc', webhookSecret: 'abc' }), /whsec_/)
    assert.throws(() => load({ secretKey: 'sk_test_abc', currency: 'dollars' }), /three-letter/)
    assert.throws(() => load({ secretKey: 'sk_test_abc', deposit: -5 }), /PAYMENT_DEPOSIT/)
    assert.throws(() => load({ secretKey: 'sk_test_abc', siteUrl: 'https://x.com/path' }), /SITE_URL/)
  })
})

describe('payments with Stripe', () => {
  let srv, stripe
  const received = []
  const refunded = []
  before(async () => {
    stripe = fakeStripe()
    srv = await start({ payments: SETTINGS, paymentFetch: stripe.fetchImpl })
    srv.events.on('payment.received', (b) => received.push(b))
    srv.events.on('payment.refunded', (b) => refunded.push(b))
  })
  after(() => srv.close())

  const newBooking = async (overrides) => (await postJson(`${srv.base}/api/bookings`, booking(overrides))).json()
  const checkout = (reference, email = 'ada@example.com', extra = {}) =>
    postJson(`${srv.base}/api/payments/checkout`, { reference, email, ...extra })

  test('config tells the site the deposit, never the key', async () => {
    const body = await (await fetch(`${srv.base}/api/payments/config`)).json()
    assert.deepEqual(body, { enabled: true, provider: 'stripe', amount: 50000, currency: 'USD', test: true })
  })

  test('checkout needs the right email, and the amount is the server’s', async () => {
    const b = await newBooking()
    assert.equal((await checkout(b.reference, 'someone@else.com')).status, 404)
    const res = await checkout(b.reference.toLowerCase(), 'ADA@example.com', { amount: 1 })
    assert.equal(res.status, 200)
    const { url } = await res.json()
    assert.match(url, /^https:\/\/checkout\.stripe\.com\//)
    const call = stripe.calls.at(-1)
    assert.equal(call.auth, 'Bearer sk_test_abc123')
    assert.equal(call.body.get('line_items[0][price_data][unit_amount]'), '50000')
    assert.equal(call.body.get('line_items[0][price_data][currency]'), 'usd')
    assert.equal(call.body.get('metadata[reference]'), b.reference)
    assert.equal(call.body.get('customer_email'), 'ada@example.com')
    assert.match(call.body.get('success_url'), /\/\?payment=done&session_id=\{CHECKOUT_SESSION_ID\}#manage$/)
  })

  test('returning from Stripe: unpaid stays unpaid; paid is recorded once', async () => {
    const ref = (await newBooking({ vehicleId: 'db12' })).reference
    const id = sessionId((await (await checkout(ref)).json()).url)
    const confirm = () => postJson(`${srv.base}/api/payments/confirm`, { sessionId: id })

    let res = await confirm()
    assert.equal(res.status, 200)
    assert.equal((await res.json()).payment.status, 'none')

    stripe.pay(id)
    const before = received.length
    res = await confirm()
    const summary = await res.json()
    assert.deepEqual(summary.payment, { status: 'paid', amount: 50000, currency: 'USD' })
    assert.equal(summary.reference, ref)
    assert.equal(summary.email, undefined) // no personal details
    await confirm()
    assert.equal(received.length, before + 1)
    assert.equal(received.at(-1).email, 'ada@example.com')
    assert.equal(received.at(-1).payment.status, 'paid')

    // A paid booking cannot be paid twice.
    assert.equal((await checkout(ref)).status, 409)
    // The guest's lookup shows it.
    const found = await (await postJson(`${srv.base}/api/bookings/lookup`, { reference: ref, email: 'ada@example.com' })).json()
    assert.equal(found.payment.status, 'paid')
  })

  test('confirm rejects made-up session ids', async () => {
    assert.equal((await postJson(`${srv.base}/api/payments/confirm`, { sessionId: 'nonsense' })).status, 404)
    assert.equal((await postJson(`${srv.base}/api/payments/confirm`, { sessionId: 'cs_test_doesnotexist1' })).status, 502)
  })

  test('webhook: signature checked, paid once, refunds tracked', async () => {
    const b = await newBooking({ vehicleId: '750s' })
    const id = sessionId((await (await checkout(b.reference)).json()).url)
    const session = { ...stripe.pay(id) }
    const event = { type: 'checkout.session.completed', data: { object: session } }

    assert.equal((await webhook(srv.base, event, 't=1,v1=00')).status, 400)
    const body = JSON.stringify(event)
    assert.equal((await webhook(srv.base, event, sign(body, Math.floor(Date.now() / 1000) - 3600))).status, 400) // replayed
    assert.equal((await webhook(srv.base, event, sign(body, undefined, 'whsec_wrong'))).status, 400)

    const before = received.length
    assert.equal((await webhook(srv.base, event)).status, 200)
    assert.equal((await webhook(srv.base, event)).status, 200) // Stripe retries are harmless
    assert.equal(received.length, before + 1)
    assert.equal(received.at(-1).reference, b.reference)

    const refund = { type: 'charge.refunded', data: { object: { refunded: true, payment_intent: session.payment_intent } } }
    assert.equal((await webhook(srv.base, refund)).status, 200)
    assert.equal(refunded.at(-1).payment.status, 'refunded')
  })

  test('webhook ignores a payment for the wrong amount', async () => {
    const b = await newBooking({ vehicleId: 'amg-gt' })
    const id = sessionId((await (await checkout(b.reference)).json()).url)
    const session = { ...stripe.pay(id), amount_total: 100 }
    const before = received.length
    assert.equal((await webhook(srv.base, { type: 'checkout.session.completed', data: { object: session } })).status, 200)
    assert.equal(received.length, before)
    assert.ok(srv.logs.some((l) => l.includes('payment.amount_mismatch')))
  })
})
