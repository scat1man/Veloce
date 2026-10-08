// Hardening that sits around the app: password hashes, lockouts, site-wide caps, headers.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { createSessionStore, hashPassword, parseHash, passwordMatches } from '../auth.js'
import { validate } from '../bookings.js'
import { ConfigError, loadConfig } from '../config.js'
import { openDb } from '../db.js'
import { PASSWORD, booking, isoDay, postJson, start } from './helpers.js'

const cookieFrom = (res) => res.headers.getSetCookie().find((c) => /^(__Host-)?veloce_admin=/.test(c))

describe('password hashes', () => {
  const stored = hashPassword(PASSWORD)

  test('scrypt hash round-trips and rejects wrong passwords', () => {
    assert.match(stored, /^scrypt\$32768\$8\$1\$[\w-]{22}\$[\w-]{43}$/)
    const parsed = parseHash(stored)
    assert.ok(parsed)
    assert.equal(passwordMatches(PASSWORD, parsed), true)
    assert.equal(passwordMatches(`  ${PASSWORD} `, parsed), true)
    assert.equal(passwordMatches('wrong password!', parsed), false)
    assert.equal(passwordMatches('', parsed), false)
    assert.equal(passwordMatches({ toString: () => PASSWORD }, parsed), false)
    assert.equal(passwordMatches('x'.repeat(2000), parsed), false)
  })

  test('two hashes of one password differ (random salt)', () => {
    assert.notEqual(hashPassword(PASSWORD), stored)
  })

  test('malformed or dangerously expensive hashes are refused', () => {
    for (const bad of ['', 'scrypt$1$8$1$a$b', 'bcrypt$x', 'scrypt$1048576$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(43), 'scrypt$32768$64$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(43)])
      assert.equal(parseHash(bad), null, bad)
  })

  test('ADMIN_PASSWORD_HASH works in production without ADMIN_PASSWORD; a bad one stops the server', () => {
    const config = loadConfig({ NODE_ENV: 'production', ADMIN_PASSWORD_HASH: stored })
    assert.equal(config.adminPassword, undefined)
    assert.equal(passwordMatches(PASSWORD, config.adminSecret), true)
    assert.equal(config.usingDevPassword, false)
    assert.throws(() => loadConfig({ NODE_ENV: 'production', ADMIN_PASSWORD_HASH: 'not-a-hash' }), ConfigError)
  })

  test('sign-in works against a hash end to end', async () => {
    const srv = await start({ adminPassword: undefined, adminPasswordHash: stored })
    try {
      assert.equal((await postJson(`${srv.base}/api/admin/login`, { password: 'nope nope nope' }, { Origin: srv.base })).status, 401)
      const ok = await postJson(`${srv.base}/api/admin/login`, { password: PASSWORD }, { Origin: srv.base })
      assert.equal(ok.status, 200)
      assert.ok(cookieFrom(ok))
    } finally {
      await srv.close()
    }
  })
})

test('changing the admin password signs every existing session out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'veloce-test-'))
  const db = openDb(dir)
  try {
    const before = createSessionStore(db, { hours: 1, secret: 'old password here' })
    const id = before.create()
    assert.equal(before.valid(id), true)
    const after = createSessionStore(db, { hours: 1, secret: 'new password here' })
    assert.equal(after.valid(id), false)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('site-wide limits', () => {
  let srv
  before(async () => {
    srv = await start({
      limits: {
        loginFailures: { limit: 100, windowMs: 60_000 },
        loginFailuresGlobal: { limit: 3, windowMs: 60_000 },
        bookingsGlobal: { limit: 2, windowMs: 60_000 },
      },
    })
  })
  after(() => srv.close())

  test('failed sign-ins from many IPs add up to a lockout for everyone', async () => {
    // trust proxy is off in tests, so X-Forwarded-For is ignored: model "many IPs" with the global counter.
    const login = (password) => postJson(`${srv.base}/api/admin/login`, { password }, { Origin: srv.base })
    const started = Date.now()
    for (const guess of ['a wrong guess', 'another wrong', 'third wrong!']) assert.equal((await login(guess)).status, 401)
    assert.ok(Date.now() - started >= 3 * 350, 'each failure is slowed down')
    const locked = await login(PASSWORD)
    assert.equal(locked.status, 429)
    assert.equal(cookieFrom(locked), undefined)
    assert.ok(srv.logs.some((l) => l.includes('admin.login_locked')))
  })

  test('bookings are capped site-wide, whatever the IP', async () => {
    const statuses = []
    for (const [vehicleId, offset] of [['sf90', 20], ['amg-gt', 20], ['sf90', 30]]) {
      const res = await postJson(`${srv.base}/api/bookings`, booking({ vehicleId, pickup: isoDay(offset), returnDate: isoDay(offset + 2) }))
      statuses.push(res.status)
    }
    assert.deepEqual(statuses, [201, 201, 429])
    assert.ok(srv.logs.some((l) => l.includes('spam.bookings_capped')))
  })
})

describe('booking input', () => {
  const ok = { ...booking(), vehicleId: 'sf90' }

  test('names with markup, zero-width or direction-override characters are refused', () => {
    assert.equal(validate(ok), null)
    assert.equal(validate({ ...ok, name: "Siobhán O'Neill-Núñez" }), null)
    assert.equal(validate({ ...ok, name: 'इशान गोयल' }), null)
    for (const name of ['<img src=x onerror=alert(1)>', 'Bob‮evil', 'Zero​width', 'Tab\there', '${7*7}'])
      assert.equal(validate({ ...ok, name }), 'Please enter your name.', JSON.stringify(name))
  })

  test('emails follow the HTML standard', () => {
    for (const email of ['ada@example.com', 'first.last+tag@sub.example.co.uk']) assert.equal(validate({ ...ok, email }), null, email)
    for (const email of ['"x"@example.com', 'a b@example.com', 'a@example', '<a@example.com>', 'a@-bad.com', 'a@example.com\r\nBcc: x@y.z', `${'a'.repeat(65)}@example.com`])
      assert.equal(validate({ ...ok, email }), 'Please enter a valid email.', JSON.stringify(email))
  })
})

describe('headers on the built site, in production behind HTTPS', () => {
  let srv, dir
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'veloce-dist-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>t</title>')
    srv = await start({ env: 'production', trustProxy: 'loopback', distDir: dir + '/' })
  })
  after(async () => {
    await srv.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const get = (path) => fetch(`${srv.base}${path}`, { headers: { 'X-Forwarded-Proto': 'https' } })

  test('the showroom gets the site CSP with upgrade-insecure-requests and HSTS', async () => {
    const res = await get('/')
    assert.equal(res.status, 200)
    const csp = res.headers.get('content-security-policy')
    assert.match(csp, /default-src 'self'/)
    assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/)
    assert.match(csp, /object-src 'none'/)
    assert.match(csp, /upgrade-insecure-requests/)
    assert.doesNotMatch(csp, /'unsafe-eval'/)
    assert.match(res.headers.get('strict-transport-security'), /max-age=63072000; includeSubDomains/)
    assert.equal(res.headers.get('x-permitted-cross-domain-policies'), 'none')
    assert.equal(res.headers.get('origin-agent-cluster'), '?1')
  })

  test('admin pages get a tighter CSP; API answers are sandboxed', async () => {
    const admin = (await get('/admin/login')).headers.get('content-security-policy')
    assert.match(admin, /default-src 'none'/)
    assert.doesNotMatch(admin, /wasm|blob:/)
    const api = (await get('/api/health')).headers.get('content-security-policy')
    assert.equal(api, "default-src 'none'; frame-ancestors 'none'; sandbox")
  })

  test('dotfiles and source files are never served', async () => {
    writeFileSync(join(dir, '.env'), 'SECRET=1')
    for (const path of ['/.env', '/.git/config', '/assets/.env', '/%2eenv'])
      assert.equal((await get(path)).status, 404, path)
    // Paths outside dist fall back to the page itself, never to a file from the server.
    for (const path of ['/server/config.js', '/package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/assets/../../package.json']) {
      const body = await (await get(path)).text()
      assert.doesNotMatch(body, /SECRET|adminPassword|"dependencies"/, path)
    }
  })
})
