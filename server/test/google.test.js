// "Sign in with Google": the redirect flow, guest accounts and the staff allow-list.
// Google itself is replaced by a fake token endpoint, so these tests run offline.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { loadConfig, ConfigError } from '../config.js'
import { readIdToken, safeReturnPath } from '../google.js'
import { booking, postJson, start } from './helpers.js'

const CLIENT_ID = '1234-test.apps.googleusercontent.com'
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const idToken = (claims) => `${b64({ alg: 'RS256' })}.${b64(claims)}.signature`
const claimsFor = (nonce, extra = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '10769150350006150715113082367',
  email: 'Ada@Example.com',
  email_verified: true,
  name: 'Ada <b>Lovelace</b>',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
  nonce,
  ...extra,
})

/** A stand-in for Google's token endpoint. `next` decides what the next exchange returns. */
function fakeGoogle() {
  const calls = []
  const google = {
    calls,
    next: (nonce) => ({ status: 200, body: { id_token: idToken(claimsFor(nonce)) } }),
    fetch: async (url, init) => {
      const form = new URLSearchParams(init.body)
      calls.push({ url, form })
      const { status, body } = google.next(google.nonce)
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    },
  }
  return google
}

const cookieValue = (res, name) => {
  const set = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))
  return set ? set.split(';')[0] : undefined
}

describe('Sign in with Google', () => {
  let srv, google
  before(async () => {
    google = fakeGoogle()
    srv = await start({
      googleClientId: CLIENT_ID,
      googleClientSecret: 'test-secret',
      adminGoogleEmails: 'owner@example.com',
      fetch: google.fetch,
      limits: { loginFailures: { limit: 3, windowMs: 60_000 }, googleSignIn: { limit: 1000, windowMs: 60_000 } },
    })
  })
  after(() => srv.close())

  /** Runs the whole dance up to Google's redirect back. Returns the callback's response. */
  async function signIn({ forAdmin = false, returnTo = '/#account', tamper } = {}) {
    const startUrl = `${srv.base}/auth/google?${new URLSearchParams(forAdmin ? { for: 'admin' } : { return: returnTo })}`
    const begin = await fetch(startUrl, { redirect: 'manual' })
    assert.equal(begin.status, 303)
    const to = new URL(begin.headers.get('location'))
    assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
    google.nonce = to.searchParams.get('nonce')
    const state = to.searchParams.get('state')
    const stateCookie = cookieValue(begin, 'veloce_oauth')
    assert.ok(stateCookie)
    const query = tamper?.({ state, code: 'one-time-code' }) ?? { state, code: 'one-time-code' }
    return fetch(`${srv.base}/auth/google/callback?${new URLSearchParams(query)}`, { redirect: 'manual', headers: { Cookie: stateCookie } })
  }
  const nextPage = async (res) => (await res.text()).match(/url=([^"]+)"/)?.[1].replace(/&amp;/g, '&')

  test('without a session the account API says who is signed in: nobody', async () => {
    assert.deepEqual(await (await fetch(`${srv.base}/api/account`)).json(), { google: true, user: null })
    assert.equal((await fetch(`${srv.base}/api/account/bookings`)).status, 401)
  })

  test('the start link sends the visitor to Google with PKCE, state and nonce', async () => {
    const res = await fetch(`${srv.base}/auth/google?return=/`, { redirect: 'manual' })
    const to = new URL(res.headers.get('location'))
    assert.equal(to.searchParams.get('client_id'), CLIENT_ID)
    assert.equal(to.searchParams.get('redirect_uri'), `${srv.base}/auth/google/callback`)
    assert.equal(to.searchParams.get('code_challenge_method'), 'S256')
    assert.equal(to.searchParams.get('scope'), 'openid email profile')
    assert.ok(to.searchParams.get('state').length >= 40)
    assert.ok(to.searchParams.get('nonce').length >= 40)
    assert.match(res.headers.getSetCookie().join(), /veloce_oauth=.*HttpOnly.*SameSite=Lax/i)
  })

  test('a guest signs in, sees their bookings by verified email, and signs out', async () => {
    // A booking made before signing in, with the same email in another case.
    assert.equal((await postJson(`${srv.base}/api/bookings`, booking({ email: 'ADA@example.com' }))).status, 201)
    assert.equal((await postJson(`${srv.base}/api/bookings`, booking({ email: 'someone@else.com', vehicleId: 'db12' }))).status, 201)

    const res = await signIn()
    assert.equal(res.status, 200)
    assert.equal(await nextPage(res), '/#account')
    const guest = cookieValue(res, 'veloce_guest')
    assert.ok(guest)
    assert.match(res.headers.getSetCookie().join(), /veloce_guest=.*HttpOnly.*SameSite=Strict/i)
    // The code was exchanged with the PKCE verifier and our redirect URI.
    const call = google.calls.at(-1)
    assert.equal(call.url, 'https://oauth2.googleapis.com/token')
    assert.equal(call.form.get('code'), 'one-time-code')
    assert.ok(call.form.get('code_verifier').length >= 43)

    const me = await (await fetch(`${srv.base}/api/account`, { headers: { Cookie: guest } })).json()
    assert.deepEqual(me, { google: true, user: { name: 'Ada bLovelace/b', email: 'ada@example.com' } })
    const list = await (await fetch(`${srv.base}/api/account/bookings`, { headers: { Cookie: guest } })).json()
    assert.equal(list.length, 1)
    assert.equal(list[0].vehicle, 'Ferrari SF90 Stradale')
    assert.equal(list[0].status, 'pending')
    assert.equal(list[0].email, undefined)

    // A booking made while signed in belongs to the account even when another email was typed.
    assert.equal((await postJson(`${srv.base}/api/bookings`, booking({ email: 'work@company.com', vehicleId: 'revuelto' }), { Cookie: guest })).status, 201)
    const after = await (await fetch(`${srv.base}/api/account/bookings`, { headers: { Cookie: guest } })).json()
    assert.deepEqual(after.map((b) => b.vehicle).sort(), ['Ferrari SF90 Stradale', 'Lamborghini Revuelto'])

    // Signing out needs a same-origin JSON request, like every other write.
    assert.equal((await postJson(`${srv.base}/api/account/logout`, {}, { Cookie: guest, Origin: 'https://evil.example' })).status, 403)
    assert.equal((await postJson(`${srv.base}/api/account/logout`, {}, { Cookie: guest, Origin: srv.base })).status, 200)
    assert.equal((await fetch(`${srv.base}/api/account/bookings`, { headers: { Cookie: guest } })).status, 401)
  })

  test('a callback without the matching state cookie, or replayed, is refused', async () => {
    const forged = await signIn({ tamper: (q) => ({ ...q, state: 'x'.repeat(q.state.length) }) })
    assert.equal(cookieValue(forged, 'veloce_guest'), undefined)
    assert.equal(await nextPage(forged), '/?signin=expired')

    // Same state twice: the second use finds nothing.
    const begin = await fetch(`${srv.base}/auth/google?return=/`, { redirect: 'manual' })
    const to = new URL(begin.headers.get('location'))
    google.nonce = to.searchParams.get('nonce')
    const cookie = cookieValue(begin, 'veloce_oauth')
    const url = `${srv.base}/auth/google/callback?${new URLSearchParams({ state: to.searchParams.get('state'), code: 'c' })}`
    assert.ok(cookieValue(await fetch(url, { redirect: 'manual', headers: { Cookie: cookie } }), 'veloce_guest'))
    assert.equal(cookieValue(await fetch(url, { redirect: 'manual', headers: { Cookie: cookie } }), 'veloce_guest'), undefined)
  })

  test('a token with the wrong nonce, audience or an unverified email signs nobody in', async () => {
    for (const bad of [{ nonce: 'other' }, { aud: 'someone-else.apps.googleusercontent.com' }, { email_verified: false }, { iss: 'https://evil.example' }]) {
      google.next = (nonce) => ({ status: 200, body: { id_token: idToken(claimsFor(nonce, bad)) } })
      const res = await signIn({ returnTo: '/' })
      assert.equal(cookieValue(res, 'veloce_guest'), undefined, JSON.stringify(bad))
      assert.equal(await nextPage(res), '/?signin=failed')
    }
    google.next = () => ({ status: 400, body: { error: 'invalid_grant' } })
    assert.equal(await nextPage(await signIn({ returnTo: '/' })), '/?signin=failed')
    google.next = (nonce) => ({ status: 200, body: { id_token: idToken(claimsFor(nonce)) } })
  })

  test('the visitor cancelling at Google just comes back', async () => {
    const res = await signIn({ returnTo: '/#account', tamper: (q) => ({ state: q.state, error: 'access_denied' }) })
    assert.equal(await nextPage(res), '/?signin=cancelled#account')
  })

  test('only paths on this site are accepted as the return address', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/a\nb', undefined, ['/x']]) assert.equal(safeReturnPath(bad), '/')
    assert.equal(safeReturnPath('/#account'), '/#account')
  })

  test('staff: an allowed Google account opens the console, anyone else is refused and counted', async () => {
    assert.equal((await (await fetch(`${srv.base}/api/admin/session`)).json()).google, true)

    google.next = (nonce) => ({ status: 200, body: { id_token: idToken(claimsFor(nonce, { email: 'stranger@example.com', sub: '42' })) } })
    const denied = await signIn({ forAdmin: true })
    assert.equal(await nextPage(denied), '/admin/login?google=denied')
    assert.equal(cookieValue(denied, 'veloce_admin'), undefined)
    assert.ok(srv.logs.some((l) => l.includes('admin.login_failed') && l.includes('stranger@example.com')))

    google.next = (nonce) => ({ status: 200, body: { id_token: idToken(claimsFor(nonce, { email: 'Owner@Example.com', sub: '7' })) } })
    const ok = await signIn({ forAdmin: true })
    assert.equal(await nextPage(ok), '/admin')
    const admin = cookieValue(ok, 'veloce_admin')
    assert.ok(admin)
    // A guest Google session is not an admin session.
    assert.equal(cookieValue(ok, 'veloce_guest'), undefined)
    assert.equal((await fetch(`${srv.base}/api/admin/bookings`, { headers: { Cookie: admin } })).status, 200)
    const activity = await (await fetch(`${srv.base}/api/admin/activity`, { headers: { Cookie: admin } })).json()
    assert.ok(activity.some((e) => e.event === 'login_ok' && e.detail === 'Google (owner@example.com)'))
  })

  test('the callback page carries the site CSP and is never cached', async () => {
    const res = await signIn({ returnTo: '/' })
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.doesNotMatch(await res.text(), /<script/)
  })
})

describe('Google sign-in switched off', () => {
  let srv
  before(async () => (srv = await start()))
  after(() => srv.close())

  test('no buttons, and the start link goes home', async () => {
    assert.deepEqual(await (await fetch(`${srv.base}/api/account`)).json(), { google: false, user: null })
    const res = await fetch(`${srv.base}/auth/google?for=admin`, { redirect: 'manual' })
    assert.equal(res.headers.get('location'), '/admin/login')
    assert.equal((await (await fetch(`${srv.base}/api/admin/session`)).json()).google, false)
  })
})

describe('Google settings', () => {
  test('client ID and secret come as a pair; staff emails are checked', () => {
    assert.throws(() => loadConfig({ GOOGLE_CLIENT_ID: CLIENT_ID }), ConfigError)
    assert.throws(() => loadConfig({ GOOGLE_CLIENT_ID: 'not-an-id', GOOGLE_CLIENT_SECRET: 's' }), ConfigError)
    assert.throws(() => loadConfig({ GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: 's', ADMIN_GOOGLE_EMAILS: 'nope' }), ConfigError)
    const config = loadConfig({ GOOGLE_CLIENT_ID: ` ${CLIENT_ID} `, GOOGLE_CLIENT_SECRET: 's', ADMIN_GOOGLE_EMAILS: ' A@B.com, c@d.org ' })
    assert.deepEqual([...config.adminGoogleEmails], ['a@b.com', 'c@d.org'])
  })

  test('expired tokens are refused', () => {
    const claims = claimsFor('n', { exp: Math.floor(Date.now() / 1000) - 600 })
    assert.throws(() => readIdToken(idToken(claims), { clientId: CLIENT_ID, nonce: 'n' }), /expired/)
  })
})
