// Visitor analytics without cookies or third parties, kept in the site's own SQLite database.
// A visitor is a hash of their IP and browser with a salt that changes every day (as Plausible
// does): the same person counts once per day, nobody can be followed from one day to the next,
// and no raw IP or user agent is ever stored. Tables analytics_events and analytics_salts, see db.js.
import { createHash, randomBytes } from 'node:crypto'
import { vehicles } from './catalog.js'

// The public site's sections, in page order (the id of each <section> in src/sections/).
export const SECTIONS = ['top', 'marques', 'showroom', 'experience', 'locations', 'about', 'concierge']
// What the website may report. Bookings are recorded by the server itself when one is saved.
const CLIENT_KINDS = new Set(['pageview', 'section', 'car', 'booking_start'])
// Crawlers, link previews, uptime checks and scripts. Real browsers all say "Mozilla/".
const BOT = /bot|crawl|spider|slurp|scrape|fetch|preview|monitor|uptime|lighthouse|pagespeed|headless|phantom|puppeteer|playwright|selenium|curl|wget|python|httpclient|okhttp|axios|node-fetch|go-http|java\/|facebookexternalhit|embedly|whatsapp|telegram/i
const SOURCES = [
  [/(^|\.)google\./, 'Google'], [/(^|\.)bing\.com$/, 'Bing'], [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'], [/(^|\.)yahoo\./, 'Yahoo'],
  [/(^|\.)instagram\.com$/, 'Instagram'], [/(^|\.)facebook\.com$|^fb\.me$/, 'Facebook'], [/^t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, 'X'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'], [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'], [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)tiktok\.com$/, 'TikTok'], [/(^|\.)pinterest\./, 'Pinterest'], [/^chatgpt\.com$|^chat\.openai\.com$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'], [/^claude\.ai$/, 'Claude'], [/(^|\.)whatsapp\.com$/, 'WhatsApp'],
]
const MAX_ROWS = 500_000

export const isBot = (ua) => !ua || ua.length < 20 || !ua.includes('Mozilla/') || BOT.test(ua)

export function deviceOf(ua = '') {
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return 'Tablet'
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'Phone'
  return 'Desktop'
}

/** Where a visit came from: ?utm_source wins, then the referring site, else Direct. */
export function sourceOf({ referrer, utm }, ownHost) {
  if (typeof utm === 'string' && utm.trim()) {
    const tag = utm.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40)
    if (tag) return SOURCES.find(([re]) => re.test(tag + '.com'))?.[1] ?? tag
  }
  if (typeof referrer !== 'string' || !referrer) return 'Direct'
  let host
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^(www|m|l|lm)\./, '')
  } catch {
    return 'Direct'
  }
  if (!host || host === ownHost?.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '')) return 'Direct'
  return SOURCES.find(([re]) => re.test(host))?.[1] ?? host.slice(0, 60)
}

const utcDay = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)

export function createAnalytics(db) {
  const getSalt = db.prepare('SELECT salt FROM analytics_salts WHERE day = ?')
  const putSalt = db.prepare('INSERT OR IGNORE INTO analytics_salts (day, salt) VALUES (?, ?)')
  const dropSalts = db.prepare('DELETE FROM analytics_salts WHERE day < ?')
  const insert = db.prepare('INSERT INTO analytics_events (day, visitor, kind, name, source, device) VALUES (?, ?, ?, ?, ?, ?)')
  // Sections, cars and booking starts count once per visitor per day, so reloading adds nothing.
  const insertOnce = db.prepare(`
    INSERT INTO analytics_events (day, visitor, kind, name, source, device)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6
    WHERE NOT EXISTS (SELECT 1 FROM analytics_events WHERE day = ?1 AND visitor = ?2 AND kind = ?3 AND name IS ?4)`)
  const purgeOld = db.prepare('DELETE FROM analytics_events WHERE day < ?')
  const trim = db.prepare('DELETE FROM analytics_events WHERE id <= (SELECT id FROM analytics_events ORDER BY id DESC LIMIT 1 OFFSET ?)')
  let writes = 0

  // The salt lives in the database so a restart (Render's free plan sleeps) does not count
  // everyone twice; yesterday's salt is deleted, after which old hashes can never be recomputed.
  const saltFor = (day) => {
    const row = getSalt.get(day)
    if (row) return row.salt
    dropSalts.run(day)
    putSalt.run(day, randomBytes(32).toString('hex'))
    return getSalt.get(day).salt
  }
  const visitorOf = (day, ip, ua) => createHash('sha256').update(`${saltFor(day)}|${ip}|${ua}`).digest('hex').slice(0, 16)

  /** Checks a report from the website. Returns the cleaned event, or null when it is not one we accept. */
  function parse(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null
    const { kind, name } = body
    if (!CLIENT_KINDS.has(kind)) return null
    if (kind === 'section') return SECTIONS.includes(name) ? { kind, name } : null
    if (kind === 'car') return typeof name === 'string' && Object.hasOwn(vehicles, name) ? { kind, name } : null
    if (kind === 'pageview') {
      const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
      return { kind, name: null, referrer: str(body.referrer, 500), utm: str(body.utm, 100) }
    }
    return { kind, name: null }
  }

  return {
    parse,

    /** Stores one event for the request's visitor. `event` is { kind, name, referrer?, utm? }. */
    record(req, event) {
      const ua = String(req.headers['user-agent'] ?? '')
      const day = utcDay()
      const visitor = visitorOf(day, req.ip ?? '', ua)
      const source = event.kind === 'pageview' ? sourceOf(event, req.headers.host) : null
      const args = [day, visitor, event.kind, event.name ?? null, source, deviceOf(ua)]
      if (event.kind === 'pageview' || event.kind === 'booking') insert.run(...args)
      else insertOnce.run(...args)
      if (++writes % 500 === 0) trim.run(MAX_ROWS)
    },

    purge: (days) => Number(purgeOld.run(utcDay(-Math.floor(days))).changes),

    /** Everything the console's Analytics page shows, for the last `days` days (UTC, today included). */
    summary(days = 30) {
      const from = utcDay(-(days - 1))
      const prevFrom = utcDay(-(2 * days - 1))
      const one = (sql, ...params) => db.prepare(sql).get(...params)
      const all = (sql, ...params) => db.prepare(sql).all(...params)
      // A "visit" is one visitor on one day: the daily salt means a person cannot be matched across days.
      const VISITS = "COUNT(DISTINCT day || visitor)"

      const totals = (start, end) => {
        const t = one(`SELECT ${VISITS} AS visitors, SUM(kind = 'pageview') AS pageviews, SUM(kind = 'booking') AS bookings FROM analytics_events WHERE day >= ? AND day < ?`, start, end)
        return { visitors: t.visitors ?? 0, pageviews: t.pageviews ?? 0, bookings: t.bookings ?? 0 }
      }
      const tomorrow = utcDay(1)
      const byDay = new Map(all(`SELECT day, COUNT(DISTINCT visitor) AS visitors, SUM(kind = 'pageview') AS pageviews FROM analytics_events WHERE day >= ? GROUP BY day`, from).map((r) => [r.day, r]))
      const daily = Array.from({ length: days }, (_, i) => {
        const day = utcDay(i - (days - 1))
        const r = byDay.get(day)
        return { day, visitors: r?.visitors ?? 0, pageviews: r?.pageviews ?? 0 }
      })
      const visitsBy = (kind, column) =>
        all(`SELECT ${column} AS name, ${VISITS} AS visitors FROM analytics_events WHERE kind = ? AND day >= ? GROUP BY ${column} ORDER BY visitors DESC, name`, kind, from)
      const reached = (kind) => one(`SELECT ${VISITS} AS n FROM analytics_events WHERE kind = ? AND day >= ?`, kind, from).n ?? 0

      const current = totals(from, tomorrow)
      const bookingsByCar = new Map(all("SELECT name, COUNT(*) AS n FROM analytics_events WHERE kind = 'booking' AND day >= ? GROUP BY name", from).map((r) => [r.name, r.n]))
      const views = new Map(visitsBy('car', 'name').map((r) => [r.name, r.visitors]))
      const sections = new Map(visitsBy('section', 'name').map((r) => [r.name, r.visitors]))

      return {
        days,
        from,
        to: utcDay(),
        live: one("SELECT COUNT(DISTINCT visitor) AS n FROM analytics_events WHERE at >= datetime('now', '-5 minutes')").n ?? 0,
        totals: current,
        previous: totals(prevFrom, from),
        daily,
        sources: visitsBy('pageview', 'source').slice(0, 10),
        devices: visitsBy('pageview', 'device'),
        sections: SECTIONS.map((id) => ({ id, visitors: sections.get(id) ?? 0 })),
        cars: [...Object.entries(vehicles).map(([id, name]) => ({ id, name, views: views.get(id) ?? 0, bookings: bookingsByCar.get(id) ?? 0 })), ...(bookingsByCar.get('none') ? [{ id: 'none', name: 'No preference', views: 0, bookings: bookingsByCar.get('none') }] : [])].sort(
          (a, b) => b.views - a.views || b.bookings - a.bookings,
        ),
        funnel: [
          { step: 'Visited', visitors: current.visitors },
          { step: 'Opened a car', visitors: reached('car') },
          { step: 'Started a booking', visitors: reached('booking_start') },
          { step: 'Sent a booking', visitors: reached('booking') },
        ],
      }
    },
  }
}
