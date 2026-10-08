import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { booking, isoDay, postJson, start } from './helpers.js'

describe('public booking API', () => {
  let srv
  const roomy = { limit: 1000, windowMs: 60_000 }
  before(async () => (srv = await start({ limits: { bookings: roomy, lookup: roomy } })))
  after(() => srv.close())

  test('creates a booking with a long, unambiguous reference and lowercase email', async () => {
    const res = await postJson(`${srv.base}/api/bookings`, booking())
    assert.equal(res.status, 201)
    const body = await res.json()
    assert.match(body.reference, /^VLC-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)
    assert.equal(body.email, 'ada@example.com')
    assert.equal(body.status, 'pending')
  })

  test('rejects invalid input with 400', async () => {
    const cases = [
      booking({ cityId: 'paris' }),
      booking({ vehicleId: 'batmobile' }),
      booking({ vehicleId: ['sf90'] }),
      booking({ name: { $gt: '' } }),
      booking({ name: 'x'.repeat(121) }),
      booking({ email: 'not-an-email' }),
      booking({ email: 42 }),
      booking({ pickup: isoDay(5), returnDate: isoDay(4) }),
      booking({ pickup: '2027-02-31', returnDate: '2027-03-02' }),
      booking({ pickup: isoDay(-10), returnDate: isoDay(-5) }),
      [],
    ]
    for (const body of cases) {
      const res = await postJson(`${srv.base}/api/bookings`, body)
      assert.equal(res.status, 400, JSON.stringify(body))
      assert.equal(typeof (await res.json()).error, 'string')
    }
  })

  test('rejects an overlapping booking for the same car with 409', async () => {
    const first = booking({ vehicleId: 'db12', pickup: isoDay(30), returnDate: isoDay(34) })
    assert.equal((await postJson(`${srv.base}/api/bookings`, first)).status, 201)
    const clash = await postJson(`${srv.base}/api/bookings`, { ...first, pickup: isoDay(32), returnDate: isoDay(36) })
    assert.equal(clash.status, 409)
    // Handing back on the morning the next guest collects is fine.
    const back = await postJson(`${srv.base}/api/bookings`, { ...first, pickup: isoDay(34), returnDate: isoDay(36) })
    assert.equal(back.status, 201)
  })

  test('availability reflects bookings and validates its query', async () => {
    const q = (p) => fetch(`${srv.base}/api/availability?${new URLSearchParams(p)}`)
    const res = await q({ vehicleId: 'db12', pickup: isoDay(31), returnDate: isoDay(33) })
    assert.deepEqual(await res.json(), { available: false })
    assert.equal((await q({ vehicleId: 'nope', pickup: isoDay(31), returnDate: isoDay(33) })).status, 400)
    assert.equal((await fetch(`${srv.base}/api/availability?vehicleId=db12&vehicleId=sf90&pickup=x&returnDate=y`)).status, 400)
  })

  test('lookup needs both the reference and the email', async () => {
    const created = await (await postJson(`${srv.base}/api/bookings`, booking({ vehicleId: 'revuelto', email: 'Grace@Navy.mil' }))).json()
    const ok = await postJson(`${srv.base}/api/bookings/lookup`, { reference: created.reference.toLowerCase(), email: 'GRACE@navy.mil ' })
    assert.equal(ok.status, 200)
    const found = await ok.json()
    assert.deepEqual(Object.keys(found).sort(), ['city', 'payment', 'pickup', 'reference', 'returnDate', 'status', 'vehicle'])
    assert.deepEqual(found.payment, { status: 'none', amount: null, currency: null })
    assert.equal(found.reference, created.reference)
    assert.equal(found.vehicle, 'Lamborghini Revuelto')

    for (const body of [
      { reference: created.reference, email: 'someone@else.com' },
      { reference: 'VLC-AAAAAAAA', email: 'grace@navy.mil' },
      { reference: created.reference },
      { reference: [created.reference], email: 'grace@navy.mil' },
    ]) {
      const res = await postJson(`${srv.base}/api/bookings/lookup`, body)
      assert.equal(res.status, 404)
      assert.deepEqual(await res.json(), { error: 'No booking matches that reference and email.' })
    }
  })

  test('the old enumerable GET lookup is gone', async () => {
    assert.equal((await fetch(`${srv.base}/api/bookings/VLC-AAAAAAAA`)).status, 404)
  })

  test('malformed JSON gets a clean 400, never a stack trace', async () => {
    const res = await postJson(`${srv.base}/api/bookings`, '{"name": ')
    assert.equal(res.status, 400)
    const text = await res.text()
    assert.deepEqual(JSON.parse(text), { error: 'Malformed JSON.' })
    assert.doesNotMatch(text, /at .*\.js/)
  })

  test('oversized bodies are refused', async () => {
    const res = await postJson(`${srv.base}/api/bookings`, booking({ name: 'x'.repeat(20_000) }))
    assert.equal(res.status, 413)
  })

  test('security headers are on every response; no CORS, no x-powered-by', async () => {
    const res = await fetch(`${srv.base}/api/health`, { headers: { Origin: 'https://evil.example' } })
    // API answers get the strictest policy: they are data, never pages.
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/)
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/)
    const page = await fetch(`${srv.base}/admin/login`)
    assert.match(page.headers.get('content-security-policy'), /default-src 'none'; script-src 'self'/)
    assert.match(page.headers.get('content-security-policy'), /script-src-attr 'none'/)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin')
    assert.match(res.headers.get('permissions-policy'), /camera=\(\)/)
    assert.equal(res.headers.get('x-powered-by'), null)
    assert.equal(res.headers.get('access-control-allow-origin'), null)
    assert.equal(res.headers.get('strict-transport-security'), null) // dev + plain http
  })
})

describe('spam protection', () => {
  let srv
  before(async () => (srv = await start({ limits: { bookings: { limit: 3, windowMs: 60_000 }, lookup: { limit: 2, windowMs: 60_000 } } })))
  after(() => srv.close())

  test('honeypot: looks like success, stores nothing', async () => {
    const res = await postJson(`${srv.base}/api/bookings`, booking({ vehicleId: 'amg-gt', website: 'http://spam.example' }))
    assert.equal(res.status, 201)
    const body = await res.json()
    assert.match(body.reference, /^VLC-/)
    assert.equal(body.status, 'pending')
    // Not stored: the lookup finds nothing and the car is still free.
    const lookup = await postJson(`${srv.base}/api/bookings/lookup`, { reference: body.reference, email: 'ada@example.com' })
    assert.equal(lookup.status, 404)
    const avail = await fetch(`${srv.base}/api/availability?${new URLSearchParams({ vehicleId: 'amg-gt', pickup: isoDay(10), returnDate: isoDay(13) })}`)
    assert.deepEqual(await avail.json(), { available: true })
    assert.ok(srv.logs.some((l) => l.includes('spam.honeypot')))
  })

  test('booking rate limit answers 429 with Retry-After', async () => {
    // One hit was used by the honeypot test; two more are allowed, then 429.
    await postJson(`${srv.base}/api/bookings`, booking({ vehicleId: '750s' }))
    await postJson(`${srv.base}/api/bookings`, booking({ vehicleId: 'gt3-rs' }))
    const res = await postJson(`${srv.base}/api/bookings`, booking({ vehicleId: null }))
    assert.equal(res.status, 429)
    assert.ok(Number(res.headers.get('retry-after')) > 0)
    assert.equal(typeof (await res.json()).error, 'string')
  })

  test('lookup rate limit answers 429', async () => {
    let last
    for (let i = 0; i < 3; i++) last = await postJson(`${srv.base}/api/bookings/lookup`, { reference: 'VLC-AAAAAAAA', email: 'a@b.co' })
    assert.equal(last.status, 429)
    assert.ok(last.headers.get('retry-after'))
  })
})
