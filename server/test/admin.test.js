import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { PASSWORD, booking, postJson, start } from './helpers.js'

// Over HTTPS the cookie carries the __Host- prefix.
const cookieFrom = (res) => res.headers.getSetCookie().find((c) => /^(__Host-)?veloce_admin=/.test(c))

describe('admin', () => {
  let srv, origin, cookie
  before(async () => {
    srv = await start({ limits: { loginFailures: { limit: 3, windowMs: 60_000 } } })
    origin = srv.base
  })
  after(() => srv.close())

  const login = (password, headers = { Origin: origin }) => postJson(`${srv.base}/api/admin/login`, { password }, headers)

  test('admin API answers 401 JSON without a session; the page redirects to sign-in', async () => {
    const res = await fetch(`${srv.base}/api/admin/bookings`)
    assert.equal(res.status, 401)
    assert.equal(typeof (await res.json()).error, 'string')
    const patch = await fetch(`${srv.base}/api/admin/bookings/VLC-AAAAAAAA`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: '{"status":"confirmed"}',
    })
    assert.equal(patch.status, 401)
    const page = await fetch(`${srv.base}/admin`, { redirect: 'manual' })
    assert.equal(page.status, 303)
    assert.equal(page.headers.get('location'), '/admin/login')
    const form = await fetch(`${srv.base}/admin/login`)
    assert.equal(form.status, 200)
    const html = await form.text()
    assert.match(html, /type="password"/)
    assert.doesNotMatch(html, /<script>/) // inline scripts would break the CSP
  })

  test('Basic auth no longer works', async () => {
    const res = await fetch(`${srv.base}/api/admin/bookings`, { headers: { Authorization: 'Basic ' + Buffer.from('x:' + PASSWORD).toString('base64') } })
    assert.equal(res.status, 401)
  })

  test('wrong password fails and is logged', async () => {
    const res = await login('wrong password')
    assert.equal(res.status, 401)
    assert.equal(cookieFrom(res), undefined)
    assert.ok(srv.logs.some((l) => l.includes('admin.login_failed') && l.includes('ip=')))
  })

  test('login from a foreign origin is blocked', async () => {
    const res = await login(PASSWORD, { Origin: 'https://evil.example' })
    assert.equal(res.status, 403)
    assert.equal(cookieFrom(res), undefined)
  })

  test('correct password issues an HttpOnly, SameSite=Strict session cookie', async () => {
    const res = await login(PASSWORD)
    assert.equal(res.status, 200)
    const set = cookieFrom(res)
    assert.ok(set)
    assert.match(set, /HttpOnly/i)
    assert.match(set, /SameSite=Strict/i)
    assert.match(set, /Path=\//)
    assert.doesNotMatch(set, /Secure/) // plain http in the test
    cookie = set.split(';')[0]
    assert.ok(srv.logs.some((l) => l.includes('admin.login_ok')))

    const list = await fetch(`${srv.base}/api/admin/bookings`, { headers: { Cookie: cookie } })
    assert.equal(list.status, 200)
    assert.ok(Array.isArray(await list.json()))
    const page = await fetch(`${srv.base}/admin`, { headers: { Cookie: cookie }, redirect: 'manual' })
    assert.equal(page.status, 200)
    assert.match(await page.text(), /\/admin\/console\/console\.js/)
  })

  test('the console page and its code are only served inside a session', async () => {
    for (const path of ['/admin/console/console.js', '/admin/console/console.css', '/admin/admin.js', '/admin/anything']) {
      const anon = await fetch(`${srv.base}${path}`)
      assert.equal(anon.status, 404, path)
      assert.doesNotMatch(await anon.text(), /bookings/i, path)
    }
    const js = await fetch(`${srv.base}/admin/console/console.js`, { headers: { Cookie: cookie } })
    assert.equal(js.status, 200)
    assert.match(js.headers.get('content-type'), /javascript/)
    // The sign-in page's own files stay public.
    assert.equal((await fetch(`${srv.base}/admin/login.js`)).status, 200)
    assert.equal((await fetch(`${srv.base}/admin/login.css`)).status, 200)
    // Search engines are told to keep out of every admin page.
    assert.match((await fetch(`${srv.base}/admin/login`)).headers.get('x-robots-tag'), /noindex/)
  })

  test('session endpoint reports expiry and the catalogue only when signed in', async () => {
    assert.deepEqual(await (await fetch(`${srv.base}/api/admin/session`)).json(), { authenticated: false, google: false })
    const me = await (await fetch(`${srv.base}/api/admin/session`, { headers: { Cookie: cookie } })).json()
    assert.equal(me.authenticated, true)
    assert.ok(Date.parse(me.expiresAt) > Date.now())
    assert.equal(me.vehicles.sf90, 'Ferrari SF90 Stradale')
  })

  test('staff notes: saved, length-checked, and never shown to guests', async () => {
    const created = await (await postJson(`${srv.base}/api/bookings`, booking({ vehicleId: 'db12' }))).json()
    assert.equal(created.note, undefined)
    const patch = (body) =>
      fetch(`${srv.base}/api/admin/bookings/${created.reference}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin },
        body: JSON.stringify(body),
      })
    const saved = await patch({ note: 'Called guest.\nDeliver to hotel.' })
    assert.equal(saved.status, 200)
    const body = await saved.json()
    assert.equal(body.note, 'Called guest.\nDeliver to hotel.')
    assert.ok(body.updatedAt)
    assert.equal((await patch({ note: 'x'.repeat(2001) })).status, 400)
    assert.equal((await patch({ note: 'bad \u0000 byte' })).status, 400)
    assert.equal((await patch({ note: 42 })).status, 400)
    assert.equal((await patch({})).status, 400)
    const lookup = await (await postJson(`${srv.base}/api/bookings/lookup`, { reference: created.reference, email: 'ada@example.com' })).json()
    assert.equal(lookup.note, undefined)
  })

  test('CSV export needs a session and neutralises spreadsheet formulas', async () => {
    assert.equal((await fetch(`${srv.base}/api/admin/bookings.csv`)).status, 401)
    await postJson(`${srv.base}/api/bookings`, booking({ vehicleId: '750s', name: '=HYPERLINK("http://evil")' }))
    const res = await fetch(`${srv.base}/api/admin/bookings.csv`, { headers: { Cookie: cookie } })
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/csv/)
    assert.match(res.headers.get('content-disposition'), /attachment; filename="veloce-bookings-/)
    const csv = await res.text()
    assert.match(csv, /"Reference","Status"/)
    assert.match(csv, /"'=HYPERLINK\(""http:\/\/evil""\)"/)
    assert.ok(srv.logs.some((l) => l.includes('admin.export')))
  })

  test('delete removes a booking for good, needs a session and a same-site request', async () => {
    const created = await (await postJson(`${srv.base}/api/bookings`, booking({ vehicleId: 'revuelto' }))).json()
    const url = `${srv.base}/api/admin/bookings/${created.reference}`
    const del = (headers) => fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' })
    assert.equal((await del({ Origin: origin })).status, 401)
    assert.equal((await del({ Cookie: cookie, Origin: 'https://evil.example' })).status, 403)
    assert.equal((await del({ Cookie: cookie, Origin: origin })).status, 200)
    assert.equal((await del({ Cookie: cookie, Origin: origin })).status, 404)
    const list = await (await fetch(`${srv.base}/api/admin/bookings`, { headers: { Cookie: cookie } })).json()
    assert.ok(!list.some((b) => b.reference === created.reference))
    assert.ok(srv.logs.some((l) => l.includes('admin.booking_deleted')))
  })

  test('a made-up session cookie is not accepted', async () => {
    const res = await fetch(`${srv.base}/api/admin/bookings`, { headers: { Cookie: 'veloce_admin=' + 'A'.repeat(43) } })
    assert.equal(res.status, 401)
  })

  test('status update works, is audited, and rejects unknown statuses', async () => {
    const created = await (await postJson(`${srv.base}/api/bookings`, booking())).json()
    const patch = (body, headers = {}) =>
      fetch(`${srv.base}/api/admin/bookings/${created.reference}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin, ...headers },
        body: JSON.stringify(body),
      })
    const ok = await patch({ status: 'confirmed' })
    assert.equal(ok.status, 200)
    assert.equal((await ok.json()).status, 'confirmed')
    assert.ok(srv.logs.some((l) => l.includes('admin.status_change') && l.includes(created.reference) && l.includes('"confirmed"')))

    assert.equal((await patch({ status: 'shipped' })).status, 400)
    assert.equal((await patch({ status: ['confirmed'] })).status, 400)
  })

  test('CSRF: foreign Origin, missing Origin/Referer, or non-JSON body is rejected', async () => {
    const created = await (await postJson(`${srv.base}/api/bookings`, booking({ vehicleId: 'gt3-rs' }))).json()
    const url = `${srv.base}/api/admin/bookings/${created.reference}`
    const foreign = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://evil.example' }, body: '{"status":"cancelled"}' })
    assert.equal(foreign.status, 403)
    const badReferer = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie, Referer: 'https://evil.example/x' }, body: '{"status":"cancelled"}' })
    assert.equal(badReferer.status, 403)
    const none = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{"status":"cancelled"}' })
    assert.equal(none.status, 403)
    const form = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'text/plain', Cookie: cookie, Origin: origin }, body: '{"status":"cancelled"}' })
    assert.equal(form.status, 415)
    // The referer of a same-site page is accepted when Origin is absent.
    const sameSiteReferer = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie, Referer: `${origin}/admin` }, body: '{"status":"pending"}' })
    assert.equal(sameSiteReferer.status, 200)
    const still = await (await fetch(`${srv.base}/api/admin/bookings`, { headers: { Cookie: cookie } })).json()
    assert.equal(still.find((b) => b.reference === created.reference).status, 'pending')
  })

  test('logout ends the session server-side', async () => {
    const res = await postJson(`${srv.base}/api/admin/logout`, {}, { Cookie: cookie, Origin: origin })
    assert.equal(res.status, 200)
    assert.equal((await fetch(`${srv.base}/api/admin/bookings`, { headers: { Cookie: cookie } })).status, 401)
  })

  test('brute force: too many failures from one IP get 429, even with the right password', async () => {
    // The earlier successful sign-in reset the counter; the limit is 3 failures.
    for (const guess of ['nope 1', 'nope 2', 'nope 3']) assert.equal((await login(guess)).status, 401)
    const blocked = await login(PASSWORD)
    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.headers.get('retry-after')) > 0)
    assert.equal(cookieFrom(blocked), undefined)
  })
})

describe('admin behind an HTTPS proxy (production)', () => {
  let srv
  before(async () => (srv = await start({ env: 'production', trustProxy: 'loopback' })))
  after(() => srv.close())

  test('cookie is Secure and HSTS is sent when the proxy says https', async () => {
    const res = await postJson(`${srv.base}/api/admin/login`, { password: PASSWORD }, { Origin: srv.base, 'X-Forwarded-Proto': 'https' })
    assert.equal(res.status, 200)
    assert.match(cookieFrom(res), /Secure/)
    assert.match(cookieFrom(res), /^__Host-veloce_admin=/)
    assert.doesNotMatch(cookieFrom(res), /Domain=/i)
    assert.match(res.headers.get('strict-transport-security'), /max-age=/)
  })

  test('plain http through the proxy is redirected to https; direct requests still work', async () => {
    const res = await fetch(`${srv.base}/api/health`, { headers: { 'X-Forwarded-Proto': 'http' }, redirect: 'manual' })
    assert.equal(res.status, 308)
    assert.match(res.headers.get('location'), /^https:\/\/127\.0\.0\.1:\d+\/api\/health$/)
    const direct = await fetch(`${srv.base}/api/health`)
    assert.equal(direct.status, 200)
    assert.equal(direct.headers.get('strict-transport-security'), null)
  })
})

describe('admin activity log', () => {
  let srv, cookie
  before(async () => {
    srv = await start()
    const res = await postJson(`${srv.base}/api/admin/login`, { password: PASSWORD }, { Origin: srv.base })
    cookie = cookieFrom(res).split(';')[0]
  })
  after(() => srv.close())

  test('needs a session', async () => {
    assert.equal((await fetch(`${srv.base}/api/admin/activity`)).status, 401)
    assert.equal((await fetch(`${srv.base}/api/admin/bookings/VLC-AAAAAAAA/history`)).status, 401)
  })

  test('records sign-ins and changes, newest first, with per-booking history', async () => {
    const created = await (await postJson(`${srv.base}/api/bookings`, booking())).json()
    const patch = (body) =>
      fetch(`${srv.base}/api/admin/bookings/${created.reference}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: srv.base },
        body: JSON.stringify(body),
      })
    assert.equal((await patch({ status: 'confirmed' })).status, 200)
    assert.equal((await patch({ note: 'Deliver to the Four Seasons' })).status, 200)

    const log = await (await fetch(`${srv.base}/api/admin/activity`, { headers: { Cookie: cookie } })).json()
    assert.deepEqual(log.slice(0, 3).map((e) => e.event), ['note_saved', 'status_change', 'login_ok'])
    assert.equal(log[1].detail, 'pending → confirmed')
    assert.equal(log[1].reference, created.reference)
    assert.ok(!JSON.stringify(log).includes('Four Seasons'), 'note text is not copied into the log')

    const history = await (await fetch(`${srv.base}/api/admin/bookings/${created.reference.toLowerCase()}/history`, { headers: { Cookie: cookie } })).json()
    assert.deepEqual(history.map((e) => e.event), ['note_saved', 'status_change'])
  })

  test('blocked cross-site requests are not stored', async () => {
    await postJson(`${srv.base}/api/admin/login`, { password: 'x' }, { Origin: 'https://evil.example' })
    const log = await (await fetch(`${srv.base}/api/admin/activity`, { headers: { Cookie: cookie } })).json()
    assert.ok(!log.some((e) => e.event === 'csrf_blocked'))
  })

  test('the Activity page is part of the console', async () => {
    const page = await (await fetch(`${srv.base}/admin`, { headers: { Cookie: cookie } })).text()
    assert.match(page, /id="view-activity"/)
  })
})
