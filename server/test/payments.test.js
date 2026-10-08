// Online deposits through Razorpay Payment Links, with a stand-in for Razorpay's API.
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { loadConfig } from '../config.js'
import { booking, postJson, start } from './helpers.js'

const WEBHOOK_SECRET = 'webhook-secret-123'
const SETTINGS = { keyId: 'rzp_test_abc123', keySecret: 'secret456', webhookSecret: WEBHOOK_SECRET, currency: 'INR', deposit: 5000 }

/** Pretends to be api.razorpay.com: remembers each payment link it creates; tests flip them to paid. */
function fakeRazorpay() {
  const links = new Map()
  const calls = []
  let n = 0
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ method: init.method, path, body, auth: init.headers.Authorization })
    if (init.method === 'POST' && path === '/v1/payment_links') {
      const id = `plink_Test${String(++n).padStart(8, '0')}`
      const l = { id, short_url: `https://rzp.io/rzp/${id}`, status: 'created', amount: body.amount, amount_paid: 0, currency: body.currency, notes: body.notes, payments: null }
      links.set(id, l)
      return reply(200, l)
    }
    const m = path.match(/^\/v1\/payment_links\/(.+)$/)
    if (init.method === 'GET' && m) return links.has(m[1]) ? reply(200, links.get(m[1])) : reply(400, { error: { description: 'The id provided does not exist' } })
    return reply(404, { error: { description: 'Unexpected call' } })
  }
  const pay = (id) => {
    const l = links.get(id)
    return Object.assign(l, { status: 'paid', amount_paid: l.amount, payments: [{ payment_id: `pay_${id.slice(-8)}`, status: 'captured' }] })
  }
  return { fetchImpl, links, calls, pay }
}

const sign = (body, secret = WEBHOOK_SECRET) => createHmac('sha256', secret).update(body).digest('hex')
const webhook = (base, event, signature) => {
  const body = JSON.stringify(event)
  return fetch(`${base}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature ?? sign(body) },
    body,
  })
}
const linkId = (url) => url.split('/').pop()
const paidEvent = (l) => ({
  event: 'payment_link.paid',
  payload: { payment_link: { entity: l }, payment: { entity: { id: l.payments[0].payment_id, amount: l.amount_paid } } },
})

describe('payments switched off (no Razorpay keys)', () => {
  let srv
  before(async () => (srv = await start()))
  after(() => srv.close())

  test('the site says so, and every payment route is closed', async () => {
    assert.deepEqual(await (await fetch(`${srv.base}/api/payments/config`)).json(), { enabled: false })
    assert.equal((await postJson(`${srv.base}/api/payments/checkout`, { reference: 'VLC-X', email: 'a@b.co' })).status, 404)
    assert.equal((await postJson(`${srv.base}/api/payments/confirm`, { sessionId: 'plink_Abcdefgh123' })).status, 404)
    assert.equal((await webhook(srv.base, { event: 'payment_link.paid' })).status, 404)
  })

  test('booking still works without payment', async () => {
    const res = await postJson(`${srv.base}/api/bookings`, booking())
    assert.equal(res.status, 201)
    assert.equal((await res.json()).payment.status, 'none')
  })
})

describe('payment settings', () => {
  const load = (payments) => loadConfig({}, { payments })
  test('off without keys, on with both, amount in paise', () => {
    assert.equal(loadConfig({}).payments, null)
    const p = loadConfig({ RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 's3cret', PAYMENT_DEPOSIT: '2500' }).payments
    assert.equal(p.amount, 250000)
    assert.equal(p.currency, 'INR')
    assert.equal(p.test, true)
    assert.equal(load({ ...SETTINGS, currency: 'usd', deposit: 500 }).payments.currency, 'USD')
  })
  test('mistakes stop the server with a plain message', () => {
    assert.throws(() => load({ keyId: 'rzp_test_abc' }), /both/)
    assert.throws(() => load({ keyId: 'hello', keySecret: 'x' }), /rzp_test_/)
    assert.throws(() => load({ keyId: 'rzp_test_abc', keySecret: 'rzp_test_abc' }), /key id/)
    assert.throws(() => load({ ...SETTINGS, currency: 'rupees' }), /three-letter/)
    assert.throws(() => load({ ...SETTINGS, deposit: -5 }), /PAYMENT_DEPOSIT/)
    assert.throws(() => load({ ...SETTINGS, siteUrl: 'https://x.com/path' }), /SITE_URL/)
  })
})

describe('payments with Razorpay', () => {
  let srv, rzp
  const received = []
  const refunded = []
  before(async () => {
    rzp = fakeRazorpay()
    srv = await start({ payments: SETTINGS, paymentFetch: rzp.fetchImpl })
    srv.events.on('payment.received', (b) => received.push(b))
    srv.events.on('payment.refunded', (b) => refunded.push(b))
  })
  after(() => srv.close())

  const newBooking = async (overrides) => (await postJson(`${srv.base}/api/bookings`, booking(overrides))).json()
  const checkout = (reference, email = 'ada@example.com', extra = {}) =>
    postJson(`${srv.base}/api/payments/checkout`, { reference, email, ...extra })

  test('config tells the site the deposit, never the keys', async () => {
    const body = await (await fetch(`${srv.base}/api/payments/config`)).json()
    assert.deepEqual(body, { enabled: true, provider: 'razorpay', amount: 500000, currency: 'INR', test: true })
  })

  test('checkout needs the right email, and the amount is the server’s', async () => {
    const b = await newBooking()
    assert.equal((await checkout(b.reference, 'someone@else.com')).status, 404)
    const res = await checkout(b.reference.toLowerCase(), 'ADA@example.com', { amount: 1 })
    assert.equal(res.status, 200)
    const { url } = await res.json()
    assert.match(url, /^https:\/\/rzp\.io\//)
    const call = rzp.calls.at(-1)
    assert.equal(call.auth, 'Basic ' + Buffer.from('rzp_test_abc123:secret456').toString('base64'))
    assert.equal(call.body.amount, 500000)
    assert.equal(call.body.currency, 'INR')
    assert.deepEqual(call.body.notes, { reference: b.reference })
    assert.deepEqual(call.body.customer, { name: 'Ada Lovelace', email: 'ada@example.com' })
    assert.deepEqual(call.body.notify, { sms: false, email: false })
    assert.match(call.body.callback_url, /\/api\/payments\/return$/)
    assert.ok(call.body.reference_id.length <= 40)
  })

  test('the return address forwards to the booking panel', async () => {
    let res = await fetch(`${srv.base}/api/payments/return?razorpay_payment_link_id=plink_Abc12345&razorpay_payment_link_status=paid`, { redirect: 'manual' })
    assert.equal(res.status, 303)
    assert.equal(res.headers.get('location'), '/?payment=done&session_id=plink_Abc12345#manage')
    res = await fetch(`${srv.base}/api/payments/return?razorpay_payment_link_id=https://evil.example`, { redirect: 'manual' })
    assert.equal(res.headers.get('location'), '/#manage')
  })

  test('returning from Razorpay: unpaid stays unpaid; paid is recorded once', async () => {
    const ref = (await newBooking({ vehicleId: 'db12' })).reference
    const id = linkId((await (await checkout(ref)).json()).url)
    const confirm = () => postJson(`${srv.base}/api/payments/confirm`, { sessionId: id })

    let res = await confirm()
    assert.equal(res.status, 200)
    assert.equal((await res.json()).payment.status, 'none')

    rzp.pay(id)
    const before = received.length
    const summary = await (await confirm()).json()
    assert.deepEqual(summary.payment, { status: 'paid', amount: 500000, currency: 'INR' })
    assert.equal(summary.reference, ref)
    assert.equal(summary.email, undefined) // no personal details
    await confirm()
    assert.equal(received.length, before + 1)
    assert.equal(received.at(-1).email, 'ada@example.com')
    assert.equal(received.at(-1).payment.paymentId, `pay_${id.slice(-8)}`)

    // A paid booking cannot be paid twice, and the guest's lookup shows it.
    assert.equal((await checkout(ref)).status, 409)
    const found = await (await postJson(`${srv.base}/api/bookings/lookup`, { reference: ref, email: 'ada@example.com' })).json()
    assert.equal(found.payment.status, 'paid')
  })

  test('confirm rejects made-up ids', async () => {
    assert.equal((await postJson(`${srv.base}/api/payments/confirm`, { sessionId: 'nonsense' })).status, 404)
    assert.equal((await postJson(`${srv.base}/api/payments/confirm`, { sessionId: 'plink_DoesNotExist1' })).status, 502)
  })

  test('webhook: signature checked, paid once, refunds tracked', async () => {
    const b = await newBooking({ vehicleId: '750s' })
    const id = linkId((await (await checkout(b.reference)).json()).url)
    const event = paidEvent({ ...rzp.pay(id) })

    assert.equal((await webhook(srv.base, event, '00')).status, 400)
    assert.equal((await webhook(srv.base, event, sign(JSON.stringify(event), 'wrong-secret'))).status, 400)

    const before = received.length
    assert.equal((await webhook(srv.base, event)).status, 200)
    assert.equal((await webhook(srv.base, event)).status, 200) // Razorpay retries are harmless
    assert.equal(received.length, before + 1)
    assert.equal(received.at(-1).reference, b.reference)

    const paymentId = event.payload.payment.entity.id
    const partial = { event: 'refund.processed', payload: { payment: { entity: { id: paymentId, amount: 500000, amount_refunded: 100000 } } } }
    await webhook(srv.base, partial)
    assert.equal(refunded.length, 0)
    const full = { event: 'refund.processed', payload: { payment: { entity: { id: paymentId, amount: 500000, amount_refunded: 500000 } } } }
    assert.equal((await webhook(srv.base, full)).status, 200)
    assert.equal(refunded.at(-1).payment.status, 'refunded')
  })

  test('webhook ignores a payment for the wrong amount', async () => {
    const b = await newBooking({ vehicleId: 'amg-gt' })
    const id = linkId((await (await checkout(b.reference)).json()).url)
    const event = paidEvent({ ...rzp.pay(id), amount_paid: 100 })
    const before = received.length
    assert.equal((await webhook(srv.base, event)).status, 200)
    assert.equal(received.length, before)
    assert.ok(srv.logs.some((l) => l.includes('payment.amount_mismatch')))
  })
})
