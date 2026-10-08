// "Sign in with Google" for guests and staff, as a plain OAuth 2.0 / OpenID Connect redirect:
// the visitor goes to Google, Google sends them back with a one-time code, and the server
// trades that code for the visitor's identity directly with Google.
//
// Why a redirect and not Google's JavaScript button: the site keeps its strict Content Security
// Policy (no third-party script, frame or popup) and needs no Google code in the browser at all.
// PKCE, a random `state` bound to a cookie, and a `nonce` stop forged or replayed callbacks.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])
const FLOW_TTL_MS = 10 * 60_000
const MAX_PENDING = 2000
export const CALLBACK_PATH = '/auth/google/callback'

const b64url = (buf) => buf.toString('base64url')
const random = (bytes = 32) => b64url(randomBytes(bytes))

/** Where a guest may be sent back to after signing in: a path on this site, nothing else. */
export function safeReturnPath(value) {
  if (typeof value !== 'string' || value.length > 200) return '/'
  // "//evil.example" and "/\evil.example" are read by browsers as other sites.
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/'
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return '/'
  return value
}

/**
 * `clientId` / `clientSecret` come from Google Cloud Console. `fetchImpl` is swapped out in tests.
 * Returns null when Google sign-in is not configured, so callers can simply check `if (google)`.
 */
export function createGoogleAuth({ clientId, clientSecret, fetchImpl = fetch }) {
  if (!clientId || !clientSecret) return null
  // state -> { verifier, nonce, purpose, returnTo, redirectUri, expires }. In memory: a sign-in
  // that straddles a server restart simply has to be started again.
  const pending = new Map()

  const sweep = (now = Date.now()) => {
    for (const [state, flow] of pending) if (flow.expires <= now) pending.delete(state)
  }

  return {
    sweep,

    /** Starts a sign-in. Returns the Google URL to send the browser to, and the state for its cookie. */
    begin({ purpose, returnTo, redirectUri }) {
      sweep()
      // A flood of half-finished sign-ins cannot grow memory without bound: the oldest are dropped.
      while (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value)
      const state = random()
      const verifier = random(48)
      const nonce = random()
      pending.set(state, { verifier, nonce, purpose, returnTo, redirectUri, expires: Date.now() + FLOW_TTL_MS })
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: b64url(createHash('sha256').update(verifier).digest()),
        code_challenge_method: 'S256',
        // Always show the account chooser, so a shared computer does not silently reuse someone's account.
        prompt: 'select_account',
      })
      return { url: `${AUTH_URL}?${params}`, state }
    },

    /**
     * Takes the state from the URL and the one from the visitor's cookie. Both must match an
     * unexpired sign-in this server started; each can be used once.
     */
    take(stateFromUrl, stateFromCookie) {
      if (typeof stateFromUrl !== 'string' || typeof stateFromCookie !== 'string') return null
      const a = Buffer.from(stateFromUrl)
      const b = Buffer.from(stateFromCookie)
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null
      const flow = pending.get(stateFromUrl)
      pending.delete(stateFromUrl)
      return flow && flow.expires > Date.now() ? flow : null
    },

    /**
     * Trades the one-time code for the visitor's identity. Throws on anything unexpected.
     * Returns { sub, email, name }, with the email verified by Google.
     */
    async finish(flow, code) {
      if (typeof code !== 'string' || !code || code.length > 2048) throw new Error('missing code')
      const res = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: flow.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: flow.verifier,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || typeof body.id_token !== 'string') throw new Error(`token exchange failed (${res.status} ${body.error ?? ''})`)
      return readIdToken(body.id_token, { clientId, nonce: flow.nonce })
    },
  }
}

/**
 * Checks the ID token's claims. Its signature is not checked here, and need not be: the token came
 * straight from Google's token endpoint over HTTPS in answer to our own request, which OpenID Connect
 * Core 1.0 §3.1.3.7 accepts in place of a signature check. Everything else is checked.
 */
export function readIdToken(token, { clientId, nonce, now = Date.now() }) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('malformed id_token')
  let claims
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    throw new Error('malformed id_token')
  }
  if (!claims || typeof claims !== 'object') throw new Error('malformed id_token')
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!ISSUERS.has(claims.iss)) throw new Error('wrong issuer')
  if (!audience.includes(clientId)) throw new Error('wrong audience')
  if (audience.length > 1 && claims.azp !== clientId) throw new Error('wrong authorized party')
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now - 60_000) throw new Error('expired')
  if (typeof claims.iat === 'number' && claims.iat * 1000 > now + 5 * 60_000) throw new Error('issued in the future')
  if (claims.nonce !== nonce) throw new Error('nonce mismatch')
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new Error('missing subject')
  if (typeof claims.email !== 'string' || claims.email.length > 200 || !claims.email.includes('@')) throw new Error('missing email')
  // Only an address Google has verified proves who this is.
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new Error('email not verified')
  return { sub: claims.sub, email: claims.email.trim().toLowerCase(), name: cleanName(claims.name ?? claims.given_name ?? '') }
}

// A Google profile name is user-chosen text: keep it to what a booking's name field accepts.
// eslint-disable-next-line no-control-regex
const cleanName = (name) => (typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f-\u009f​‎‏‪-‮⁠-⁩﻿<>{}[\]\\|`$]/g, '').trim().slice(0, 120) : '')
