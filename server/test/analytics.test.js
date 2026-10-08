import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { deviceOf, isBot, sourceOf } from '../analytics.js'
import { PASSWORD, booking, postJson, start } from './helpers.js'

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

describe('analytics helpers', () => {
  test('bots and scripts are recognised, browsers are not', () => {
    assert.ok(isBot(''))
    assert.ok(isBot('curl/8.5.0'))
    assert.ok(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'))
    assert.ok(isBot('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0 Safari/537.36'))
    assert.ok(!isBot(CHROME))
    assert.ok(!isBot(IPHONE))
  })

  test('devices and sources', () => {
    assert.equal(deviceOf(IPHONE), 'Phone')
    assert.equal(deviceOf(CHROME), 'Desktop')
    assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'), 'Tablet')
    assert.equal(sourceOf({ referrer: 'https://www.google.com/' }, 'veloce.example'), 'Google')
    assert.equal(sourceOf({ referrer: 'https://l.instagram.com/' }, 'veloce.example'), 'Instagram')
    assert.equal(sourceOf({ referrer: 'https://t.co/abc' }, 'veloce.example'), 'X')
    assert.equal(sourceOf({ referrer: 'https://blog.example.org/post' }, 'veloce.example'), 'blog.example.org')
    assert.equal(sourceOf({ referrer: 'https://veloce.example/' }, 'veloce.example'), 'Direct')
    assert.equal(sourceOf({ referrer: '' }, 'veloce.example'), 'Direct')
    assert.equal(sourceOf({ referrer: 'not a url' }, 'veloce.example'), 'Direct')
    assert.equal(sourceOf({ referrer: 'https://www.google.com/', utm: 'Newsletter<script>' }, 'veloce.example'), 'newsletterscript')
    assert.equal(sourceOf({ utm: 'instagram' }, 'veloce.example'), 'Instagram')
  })
})

describe('analytics endpoint and console summary', () => {
  let srv, cookie
  before(async () => {
    srv = await start()
    const res = await postJson(`${srv.base}/api/admin/login`, { password: PASSWORD }, { Origin: srv.base })
    cookie = res.headers.getSetCookie().find((c) => /veloce_admin=/.test(c)).split(';')[0]
  })
  after(() => srv.close())

  const send = (body, { ua = CHROME, ip, headers = {} } = {}) =>
    postJson(`${srv.base}/api/events`, body, { Origin: srv.base, 'User-Agent': ua, ...(ip ? { 'X-Forwarded-For': ip } : {}), ...headers })
  const summary = async (days = 30) => {
    const res = await fetch(`${srv.base}/api/admin/analytics?days=${days}`, { headers: { Cookie: cookie } })
    assert.equal(res.status, 200)
    return res.json()
  }

  test('the summary needs a staff session', async () => {
    const res = await fetch(`${srv.base}/api/admin/analytics`)
    assert.equal(res.status, 401)
  })

  test('unknown events are refused, and nothing is stored for them', async () => {
    for (const body of [{}, { kind: 'purchase' }, { kind: 'section', name: 'secret' }, { kind: 'car', name: 'toString' }, []]) {
      const res = await send(body)
      assert.equal(res.status, 400, JSON.stringify(body))
    }
    assert.equal((await summary()).totals.pageviews, 0)
  })

  test('visits, sections, cars and a booking add up in the summary', async () => {
    assert.equal((await send({ kind: 'pageview', referrer: 'https://www.google.com/' })).status, 204)
    await send({ kind: 'pageview', referrer: '' })
    // Sections, cars and booking starts count once per visitor per day.
    await send({ kind: 'section', name: 'showroom' })
    await send({ kind: 'section', name: 'showroom' })
    await send({ kind: 'car', name: 'sf90' })
    await send({ kind: 'car', name: 'sf90' })
    await send({ kind: 'booking_start' })
    const made = await postJson(`${srv.base}/api/bookings`, booking(), { 'User-Agent': CHROME })
    assert.equal(made.status, 201)

    const s = await summary()
    assert.equal(s.days, 30)
    assert.equal(s.daily.length, 30)
    assert.equal(s.totals.visitors, 1)
    assert.equal(s.totals.pageviews, 2)
    assert.equal(s.totals.bookings, 1)
    assert.equal(s.daily.at(-1).visitors, 1)
    assert.equal(s.live, 1)
    assert.deepEqual(s.sources.map((x) => x.name).sort(), ['Direct', 'Google'])
    assert.equal(s.devices[0].name, 'Desktop')
    assert.equal(s.sections.find((x) => x.id === 'showroom').visitors, 1)
    const sf90 = s.cars.find((c) => c.id === 'sf90')
    assert.equal(sf90.views, 1)
    assert.equal(sf90.bookings, 1)
    assert.deepEqual(s.funnel.map((f) => f.visitors), [1, 1, 1, 1])
  })

  test('bots, other sites and signed-in staff are not counted', async () => {
    const before = (await summary()).totals.pageviews
    assert.equal((await send({ kind: 'pageview' }, { ua: 'Mozilla/5.0 (compatible; bingbot/2.0)' })).status, 204)
    assert.equal((await send({ kind: 'pageview' }, { headers: { Origin: 'https://evil.example' } })).status, 204)
    assert.equal((await send({ kind: 'pageview' }, { headers: { Cookie: cookie } })).status, 204)
    assert.equal((await summary()).totals.pageviews, before)
  })

  test('no raw IP or user agent is stored', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const { join } = await import('node:path')
    const db = new DatabaseSync(join(srv.dataDir, 'veloce.db'), { readOnly: true })
    const rows = db.prepare('SELECT * FROM analytics_events').all()
    db.close()
    assert.ok(rows.length > 0)
    for (const row of rows) {
      assert.match(row.visitor, /^[0-9a-f]{16}$/)
      assert.doesNotMatch(JSON.stringify(row), /127\.0\.0\.1|Mozilla|Chrome/)
    }
  })
})
