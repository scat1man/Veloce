// Every setting comes from environment variables, read and checked once at start.
// In production a weak or missing admin password stops the server before it listens.
import { fileURLToPath } from 'node:url'
import { parseHash } from './auth.js'
import { EMAIL_PROVIDERS } from './mailer.js'
import { paymentSettings } from './payments.js'

export const DEV_PASSWORD = 'veloce'
const MIN_PASSWORD = 12

export class ConfigError extends Error {}

function parseTrustProxy(value, production) {
  if (value === undefined || value === '') return production ? 1 : false
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^\d+$/.test(value)) return Number(value)
  return value // e.g. 'loopback' or a comma-separated list of subnets, as Express accepts
}

/** Builds the config from an env-like object (process.env by default) plus explicit overrides. */
export function loadConfig(env = process.env, overrides = {}) {
  const production = (overrides.env ?? env.NODE_ENV) === 'production'
  // Trimmed: a space or line break pasted into the host's settings page is invisible there,
  // and would otherwise make the right password fail.
  // ADMIN_PASSWORD_HASH (made with `npm run hash-password`) keeps the password itself out of the
  // host's settings. When it is set, ADMIN_PASSWORD is ignored.
  const hashText = (overrides.adminPasswordHash ?? env.ADMIN_PASSWORD_HASH)?.trim()
  const adminHash = hashText ? parseHash(hashText) : null
  if (hashText && !adminHash)
    throw new ConfigError('ADMIN_PASSWORD_HASH is not a valid hash. Create one with `npm run hash-password` and paste the whole line.')
  const adminPassword = adminHash ? undefined : (overrides.adminPassword ?? env.ADMIN_PASSWORD)?.trim() || (production ? undefined : DEV_PASSWORD)

  if (production && !adminHash) {
    if (!adminPassword)
      throw new ConfigError('ADMIN_PASSWORD is not set. In production, set it to a long random value (at least 12 characters).')
    if (adminPassword === DEV_PASSWORD)
      throw new ConfigError(`ADMIN_PASSWORD is still the demo default "${DEV_PASSWORD}". Choose a long random value (at least 12 characters).`)
    if (adminPassword.length < MIN_PASSWORD)
      throw new ConfigError(`ADMIN_PASSWORD is too short (${adminPassword.length} characters). Use at least ${MIN_PASSWORD}.`)
  }

  const { email, emailProblem } = emailSettings(env, overrides)
  // Google sign-in is optional: without both values the site simply shows no Google buttons.
  const googleClientId = (overrides.googleClientId ?? env.GOOGLE_CLIENT_ID)?.trim() || undefined
  const googleClientSecret = (overrides.googleClientSecret ?? env.GOOGLE_CLIENT_SECRET)?.trim() || undefined
  if (googleClientId && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(googleClientId))
    throw new ConfigError('GOOGLE_CLIENT_ID does not look like a Google OAuth client ID (it ends in .apps.googleusercontent.com).')
  if (Boolean(googleClientId) !== Boolean(googleClientSecret))
    throw new ConfigError('Google sign-in needs both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Set both, or neither.')
  // Google accounts allowed into the admin console, comma-separated. Empty: password only.
  const adminGoogleEmails = String(overrides.adminGoogleEmails ?? env.ADMIN_GOOGLE_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  for (const email of adminGoogleEmails)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ConfigError(`ADMIN_GOOGLE_EMAILS has an invalid address: "${email}".`)
  // Online deposits switch on when the Razorpay keys are set (see payments.js); null means off.
  let payments
  try {
    payments = overrides.payments === null ? null : paymentSettings(env, overrides.payments ?? {})
  } catch (err) {
    throw new ConfigError(err.message)
  }

  return {
    production,
    googleClientId,
    googleClientSecret,
    adminGoogleEmails: new Set(adminGoogleEmails),
    port: Number(overrides.port ?? env.PORT) || 3001,
    adminPassword,
    // What sign-ins are checked against: the parsed hash, or the plain password.
    adminSecret: adminHash ?? adminPassword,
    usingDevPassword: !adminHash && adminPassword === DEV_PASSWORD,
    dataDir: overrides.dataDir ?? env.DATA_DIR ?? fileURLToPath(new URL('./data/', import.meta.url)),
    trustProxy: overrides.trustProxy ?? parseTrustProxy(env.TRUST_PROXY, production),
    // Redirect http -> https when the proxy says the visitor came in over plain http.
    forceHttps: overrides.forceHttps ?? (production && env.FORCE_HTTPS !== 'false'),
    sessionHours: Number(overrides.sessionHours ?? env.SESSION_HOURS) || 8,
    retentionDays: Number(overrides.retentionDays ?? env.RETENTION_DAYS) || 180,
    distDir: overrides.distDir ?? fileURLToPath(new URL('../dist/', import.meta.url)),
    payments,
    // Tests can lower or raise limits; production uses the defaults in app.js.
    limits: overrides.limits ?? {},
    // Booking emails: null when off. See emailSettings() below.
    email,
    emailProblem,
    // Who hears about new requests (also the Reply-To on guest emails).
    ownerEmail: overrides.ownerEmail ?? email?.replyTo ?? null,
    // Links in emails. Render sets RENDER_EXTERNAL_URL by itself; SITE_URL wins (e.g. a custom domain).
    // Never taken from the request's Host header, which a visitor controls.
    siteUrl: (overrides.siteUrl ?? env.SITE_URL ?? env.RENDER_EXTERNAL_URL)?.trim() || null,
    // Tests replace the call to Google's token endpoint.
    fetch: overrides.fetch ?? globalThis.fetch,
    log: overrides.log ?? ((line) => console.log(line)),
  }
}

const ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

/**
 * Emails switch on when an API key and a sender address are set:
 *   BREVO_API_KEY or RESEND_API_KEY, plus EMAIL_FROM (an address verified with that provider).
 * A half-finished setup never stops the site: emails stay off and `emailProblem` says why.
 */
function emailSettings(env, overrides) {
  if (overrides.email !== undefined) return { email: overrides.email, emailProblem: null }
  const keys = EMAIL_PROVIDERS.map((provider) => [provider, env[`${provider.toUpperCase()}_API_KEY`]?.trim()]).filter(([, key]) => key)
  if (!keys.length) return { email: null, emailProblem: null }
  const [provider, apiKey] = keys[0]
  const from = env.EMAIL_FROM?.trim()
  if (!from || !ADDRESS.test(from))
    return { email: null, emailProblem: `${provider.toUpperCase()}_API_KEY is set but EMAIL_FROM is ${from ? 'not an email address' : 'missing'}, so emails are off.` }
  const replyTo = env.OWNER_EMAIL?.trim()
  return {
    email: {
      provider,
      apiKey,
      from,
      fromName: env.EMAIL_FROM_NAME?.trim().replace(/[\r\n<>"]/g, '') || 'VELOCÉ',
      // Guests who reply reach the owner, not the sending address.
      replyTo: replyTo && ADDRESS.test(replyTo) ? replyTo : null,
    },
    emailProblem: null,
  }
}
