// Small, dependency-free security helpers: response headers, rate limits,
// same-origin checks and cookie parsing.

export const CSP = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' lets the DRACO decoder compile its WebAssembly; nothing else may eval.
  "script-src 'self' 'wasm-unsafe-eval'",
  // No inline event handlers (onclick=...), even if markup were ever injected.
  "script-src-attr 'none'",
  // three.js DRACOLoader runs the decoder in a worker built from a blob: URL.
  "worker-src 'self' blob:",
  // Motion animates through inline style attributes; Google Fonts serves its CSS from googleapis.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  // three.js loaders fetch textures embedded in .glb files as blob:/data: URLs.
  "connect-src 'self' blob: data:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ')

// The staff pages need far less than the 3D showroom: no WebAssembly, workers, blobs or media.
export const ADMIN_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  // The console sizes chart bars with inline style attributes.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

// API answers are data, never pages: if one is ever opened directly, nothing in it may run.
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; sandbox"

const PERMISSIONS = [
  'accelerometer', 'browsing-topics', 'camera', 'display-capture', 'geolocation', 'gyroscope',
  'hid', 'idle-detection', 'magnetometer', 'microphone', 'midi', 'payment', 'publickey-credentials-get', 'serial', 'usb', 'xr-spatial-tracking',
]
  .map((feature) => `${feature}=()`)
  .join(', ')

const cspFor = (path) => (path.startsWith('/api/') ? API_CSP : path === '/admin' || path.startsWith('/admin/') ? ADMIN_CSP : CSP)

/** Headers on every response. HSTS only when the visitor really is on HTTPS in production. */
export function securityHeaders({ production }) {
  return (req, res, next) => {
    const secure = production && req.secure
    const csp = cspFor(req.path)
    // Once on HTTPS, any stray http:// sub-resource is fetched over HTTPS instead.
    res.setHeader('Content-Security-Policy', secure && csp !== API_CSP ? `${csp}; upgrade-insecure-requests` : csp)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('Permissions-Policy', PERMISSIONS)
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    res.setHeader('Origin-Agent-Cluster', '?1')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
    res.setHeader('X-DNS-Prefetch-Control', 'off')
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
    next()
  }
}

/**
 * Fixed-window counter per key, kept in memory. Fine for a single server instance;
 * several instances would each keep their own counts (use a shared store such as Redis then).
 */
export class RateLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit
    this.windowMs = windowMs
    this.hits = new Map()
  }

  /** Counts one hit. Returns { ok, retryAfter } with retryAfter in seconds. */
  hit(key, now = Date.now()) {
    let entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs }
      this.hits.set(key, entry)
    }
    entry.count++
    return { ok: entry.count <= this.limit, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) }
  }

  /** True when the key is already over its limit, without counting a hit. */
  blocked(key, now = Date.now()) {
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) return null
    return entry.count >= this.limit ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : null
  }

  reset(key) {
    this.hits.delete(key)
  }

  sweep(now = Date.now()) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key)
  }
}

export function tooMany(res, retryAfter, message = 'Too many requests. Please wait a moment and try again.') {
  res.setHeader('Retry-After', String(retryAfter))
  return res.status(429).json({ error: message })
}

/** Express middleware that counts every request against `limiter`, keyed by client IP. */
export const rateLimit = (limiter, message) => (req, res, next) => {
  const { ok, retryAfter } = limiter.hit(req.ip ?? 'unknown')
  if (!ok) return tooMany(res, retryAfter, message)
  next()
}

/**
 * CSRF defence for state-changing admin requests (on top of the SameSite=Strict cookie):
 * the browser's Origin (or, failing that, Referer) must name this very host.
 */
export function sameOrigin(req) {
  const host = req.headers.host
  if (!host) return false
  const source = req.headers.origin ?? req.headers.referer
  if (!source || source === 'null') return false
  try {
    return new URL(source).host === host
  } catch {
    return false
  }
}

export function parseCookies(header = '') {
  const cookies = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const name = part.slice(0, i).trim()
    if (!name || Object.hasOwn(cookies, name)) continue
    try {
      cookies[name] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      /* ignore malformed values */
    }
  }
  return cookies
}
