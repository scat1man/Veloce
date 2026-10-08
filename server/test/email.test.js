import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { loadConfig } from '../config.js'
import { bookingCancelled, bookingConfirmed, bookingReceived, depositReceived, depositRefunded, ownerNewBooking } from '../emails.js'
import { createMailer } from '../mailer.js'
import { PASSWORD, booking, isoDay, postJson, start } from './helpers.js'

const EMAIL = { provider: 'brevo', apiKey: 'test-key', from: 'hello@veloce.test', fromName: 'VELOCÉ', replyTo: 'owner@veloce.test' }
const fakeMailer = () => {
  const sent = []
  return { sent, enabled: true, send: async (message) => (sent.push(message), true) }
}
const settle = () => new Promise((resolve) => setImmediate(resolve))

describe('booking emails', () => {
  let srv, mailer, cookie
  const roomy = { limit: 1000, windowMs: 60_000 }
  before(async () => {
    mailer = fakeMailer()
    srv = await start({
      mailer,
      email: EMAIL,
      ownerEmail: 'owner@veloce.test',
      siteUrl: 'https://veloce.example/',
      limits: { bookings: roomy, emailRecipient: { limit: 2, windowMs: 60_000 } },
    })
    const login = await postJson(`${srv.base}/api/admin/login`, { password: PASSWORD }, { Origin: srv.base })
    cookie = login.headers.getSetCookie()[0].split(';')[0]
  })
  after(() => srv.close())

  const patch = (reference, body) =>
    fetch(`${srv.base}/api/admin/bookings/${reference}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: srv.base, Cookie: cookie },
      body: JSON.stringify(body),
    })

  test('a new booking emails the guest and the owner', async () => {
    mailer.sent.length = 0
    const created = await (await postJson(`${srv.base}/api/bookings`, booking({ vehicleId: 'gt3-rs', email: 'Guest@Example.com' }))).json()
    await settle()
    assert.deepEqual(mailer.sent.map((m) => m.to), ['guest@example.com', 'owner@veloce.test'])
    const [guest, owner] = mailer.sent
    assert.match(guest.subject, new RegExp(created.reference))
    assert.match(guest.html, /Porsche 911 GT3 RS/)
    assert.match(guest.html, /href="https:\/\/veloce\.example\/#manage"/)
    assert.match(guest.text, /Reference: VLC-/)
    assert.match(owner.html, /guest@example\.com/)
    assert.match(owner.html, /href="https:\/\/veloce\.example\/admin"/)
  })

  test('staff confirming or declining emails the guest; notes and repeats do not', async () => {
    const created = await (await postJson(`${srv.base}/api/bookings`, booking({ vehicleId: 'amg-gt', email: 'drive@example.com' }))).json()
    await settle()
    mailer.sent.length = 0
    assert.equal((await patch(created.reference, { status: 'confirmed' })).status, 200)
    assert.equal((await patch(created.reference, { status: 'confirmed' })).status, 200)
    assert.equal((await patch(created.reference, { note: 'VIP' })).status, 200)
    assert.equal((await patch(created.reference, { status: 'cancelled' })).status, 200)
    assert.equal((await patch(created.reference, { status: 'pending' })).status, 200)
    await settle()
    assert.deepEqual(
      mailer.sent.map((m) => [m.to, m.tag.split(' ')[0]]),
      [['drive@example.com', 'booking-confirmed'], ['drive@example.com', 'booking-cancelled']],
    )
    assert.match(mailer.sent[1].text, /Reply to this email/)
  })

  test('one inbox gets at most a few request emails, whoever fills in the form', async () => {
    mailer.sent.length = 0
    for (const offset of [100, 110, 120]) {
      const res = await postJson(`${srv.base}/api/bookings`, booking({ vehicleId: '750s', pickup: isoDay(offset), returnDate: isoDay(offset + 2), email: 'victim@example.com' }))
      assert.equal(res.status, 201)
    }
    await settle()
    assert.equal(mailer.sent.filter((m) => m.to === 'victim@example.com').length, 2)
    assert.equal(mailer.sent.filter((m) => m.to === 'owner@veloce.test').length, 3)
  })

  test('a paid or refunded deposit emails the guest a receipt', async () => {
    mailer.sent.length = 0
    const paid = { ...booking(), reference: 'VLC-PAIDPAID', email: 'payer@example.com', vehicle: 'McLaren 750S', city: 'Miami, FL',
      payment: { status: 'paid', amount: 50000, currency: 'USD', paymentId: 'pi_123', paidAt: '2026-10-08 06:00:00' } }
    srv.events.emit('payment.received', paid)
    srv.events.emit('payment.refunded', { ...paid, payment: { ...paid.payment, status: 'refunded' } })
    srv.events.emit('payment.received', { ...paid, payment: { status: 'none', amount: null, currency: null } })
    await settle()
    assert.deepEqual(mailer.sent.map((m) => [m.to, m.tag]), [['payer@example.com', 'deposit-received VLC-PAIDPAID'], ['payer@example.com', 'deposit-refunded VLC-PAIDPAID']])
    assert.match(mailer.sent[0].text, /Amount: 500\.00 USD/)
    assert.match(mailer.sent[0].text, /Payment: pi_123/)
    assert.match(mailer.sent[1].subject, /refunded/)
  })

  test('the honeypot sends nothing', async () => {
    mailer.sent.length = 0
    assert.equal((await postJson(`${srv.base}/api/bookings`, booking({ website: 'spam.example' }))).status, 201)
    await settle()
    assert.equal(mailer.sent.length, 0)
  })
})

describe('email templates', () => {
  const b = {
    reference: 'VLC-ABCDEFGH',
    vehicle: null,
    city: 'Miami, FL',
    pickup: '2026-10-16',
    returnDate: '2026-10-19',
    name: `Eve "<img src=x onerror=alert(1)>" O'Neil`,
    email: 'eve@example.com',
  }

  test('guest text is escaped in every email', () => {
    for (const template of [bookingReceived, bookingConfirmed, bookingCancelled, ownerNewBooking, depositReceived, depositRefunded]) {
      const { html } = template(b, { siteUrl: 'https://veloce.example' })
      assert.doesNotMatch(html, /<img/)
      assert.match(html, /&lt;img|Eve,|Eve\b/)
    }
    assert.match(ownerNewBooking(b).html, /Eve &quot;&lt;img src=x onerror=alert\(1\)&gt;&quot; O&#39;Neil/)
  })

  test('dates read naturally and links are left out without a site address', () => {
    const { html, text } = bookingReceived(b)
    assert.match(text, /Fri, October 16, 2026/)
    assert.match(text, /Chosen with our concierge/)
    assert.doesNotMatch(html, /href=/)
  })
})

describe('mailer', () => {
  test('is off without settings and never calls out', async () => {
    const mailer = createMailer(null, { fetchImpl: () => assert.fail('no request expected') })
    assert.equal(mailer.enabled, false)
    assert.equal(await mailer.send({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }), false)
  })

  test('posts the Brevo and Resend formats over HTTPS', async () => {
    const calls = []
    const fetchImpl = async (url, init) => (calls.push({ url, init }), new Response('{}', { status: 201 }))
    const message = { to: 'a@b.co', subject: 'Hi', html: '<p>h</p>', text: 'h' }
    assert.equal(await createMailer(EMAIL, { fetchImpl, log: () => {} }).send(message), true)
    assert.equal(await createMailer({ ...EMAIL, provider: 'resend' }, { fetchImpl, log: () => {} }).send(message), true)

    assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email')
    assert.equal(calls[0].init.headers['api-key'], 'test-key')
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      sender: { email: 'hello@veloce.test', name: 'VELOCÉ' },
      to: [{ email: 'a@b.co' }],
      subject: 'Hi',
      htmlContent: '<p>h</p>',
      textContent: 'h',
      replyTo: { email: 'owner@veloce.test' },
    })
    assert.equal(calls[1].url, 'https://api.resend.com/emails')
    assert.equal(calls[1].init.headers.Authorization, 'Bearer test-key')
    assert.equal(JSON.parse(calls[1].init.body).from, 'VELOCÉ <hello@veloce.test>')
  })

  test('a refusing or unreachable provider returns false instead of throwing', async (t) => {
    t.mock.method(console, 'error', () => {})
    const refusing = createMailer(EMAIL, { fetchImpl: async () => new Response('sender not verified', { status: 400 }) })
    assert.equal(await refusing.send({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }), false)
    const down = createMailer(EMAIL, { fetchImpl: async () => { throw new TypeError('fetch failed') } })
    assert.equal(await down.send({ to: 'a@b.co', subject: 's', html: 'h', text: 't' }), false)
  })
})

describe('email settings', () => {
  const env = (extra) => ({ ADMIN_PASSWORD: PASSWORD, ...extra })

  test('off by default', () => {
    const config = loadConfig(env({}))
    assert.equal(config.email, null)
    assert.equal(config.emailProblem, null)
  })

  test('on with a key and a sender; the owner gets replies', () => {
    const config = loadConfig(env({ BREVO_API_KEY: ' xkeysib-1 ', EMAIL_FROM: 'me@gmail.com', OWNER_EMAIL: 'boss@gmail.com', RENDER_EXTERNAL_URL: 'https://veloce.onrender.com' }))
    assert.equal(config.email.provider, 'brevo')
    assert.equal(config.email.apiKey, 'xkeysib-1')
    assert.equal(config.email.replyTo, 'boss@gmail.com')
    assert.equal(config.ownerEmail, 'boss@gmail.com')
    assert.equal(config.siteUrl, 'https://veloce.onrender.com')
    assert.equal(loadConfig(env({ RESEND_API_KEY: 're_1', EMAIL_FROM: 'hi@veloce.co' })).email.provider, 'resend')
  })

  test('a key without a valid sender keeps the site up with emails off', () => {
    const config = loadConfig(env({ NODE_ENV: 'production', BREVO_API_KEY: 'k', EMAIL_FROM: 'not an address' }))
    assert.equal(config.email, null)
    assert.match(config.emailProblem, /EMAIL_FROM/)
  })
})

