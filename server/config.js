// Every setting comes from environment variables, read and checked once at start.
// In production a weak or missing admin password stops the server before it listens.
import { fileURLToPath } from 'node:url'
import { parseHash } from './auth.js'

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

  return {
    production,
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
    // Tests can lower or raise limits; production uses the defaults in app.js.
    limits: overrides.limits ?? {},
    log: overrides.log ?? ((line) => console.log(line)),
  }
}
