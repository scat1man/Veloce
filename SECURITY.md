# Security

## Reporting a problem

Please report security issues privately through GitHub: **Security → Report a vulnerability**
on this repository. Do not open a public issue.

## What protects the site

**Admin sign-in**
- One staff password, checked in constant time. It can be stored as a scrypt hash
  (`ADMIN_PASSWORD_HASH`, made with `npm run hash-password`) so the password itself is not in the host's settings.
- 5 failed attempts per IP in 15 minutes, and 30 site-wide, lock sign-in until the window ends.
  Every failure is also slowed down. All attempts are logged.
- Sessions live on the server; the cookie holds only a random id and is `HttpOnly`, `SameSite=Strict`,
  `Secure` and `__Host-` prefixed over HTTPS. Changing the password signs every session out.
- The console's code is served only inside a session; everyone else gets a 404.

**Sign in with Google** (optional, off until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set)
- A server-side OpenID Connect redirect with PKCE, a one-time `state` tied to a cookie, and a `nonce`.
  No Google script, frame or popup runs on the site, so the Content Security Policy is unchanged.
- The identity token is fetched by the server straight from Google and its issuer, audience, expiry,
  nonce and verified email are all checked.
- Staff can use Google only with an account listed in `ADMIN_GOOGLE_EMAILS`; refusals count towards the
  same lockout as wrong passwords. The password sign-in keeps working.
- Guest sessions work like staff sessions (random id in an `HttpOnly`, `SameSite=Strict`, `__Host-` cookie,
  only its hash stored) and only show bookings made with the guest's Google-verified email.
  Guests who do not sign in for `RETENTION_DAYS` are forgotten.

**Requests**
- CSRF: state-changing admin calls must come from the site's own origin and carry JSON.
- Rate limits on every API, per IP, plus a site-wide cap on new bookings.
- Strict input validation (known cars and cities, real dates, HTML-standard emails, no markup or
  invisible direction characters in names), parameterised SQL, JSON bodies capped at 10 KB.
- Output is escaped in the console; CSV exports neutralise spreadsheet formulas.
- No file uploads anywhere, so there is no way to upload malware to the server.
- Booking emails escape every guest-supplied value, take their links from `SITE_URL` (never the
  request's Host header), and reach any one inbox at most 3 times an hour from the public form.
  The email API key lives only in the host's environment settings.

**Payments** (optional, Stripe Checkout, see `server/payments.js`)
- Card details are entered on Stripe's own page and never reach this server.
- The deposit amount is a server setting; nothing the browser sends can change it.
- A payment counts only when Stripe says so: either the server asks Stripe about the session, or
  Stripe's webhook arrives with a valid `Stripe-Signature` (HMAC-SHA256, at most 5 minutes old).
  The paid amount must equal the deposit asked for, and each booking is marked paid only once.
- Starting a payment needs the booking reference and email together, like the status lookup, and is rate limited.

**Headers**
- Content Security Policy: scripts only from the site itself; a tighter policy on the admin pages and a
  sandbox on API answers. HSTS (2 years), `X-Frame-Options: DENY`, `nosniff`, COOP/CORP, Permissions-Policy.
- Dotfiles (`.env`, `.git`) are never served. No stack traces or `X-Powered-By`.
- Slow-client timeouts on the HTTP server.

**Visitor analytics**
- Counted on this server (`POST /api/events`, `server/analytics.js`): no cookies, no third parties, no raw IPs or user agents stored. A visitor is a hash with a salt that is replaced every day.
- Only known event kinds, section ids and car ids are accepted; 60 reports/min per IP and 20,000/hour site-wide. Bots, other sites' pages and signed-in staff are not counted. Browsers sending Do Not Track or Global Privacy Control send nothing.
- Purged with `RETENTION_DAYS`. Only staff can read the summary (`GET /api/admin/analytics`).

**Supply chain**
- `.npmrc` turns off dependency install scripts, the usual way npm malware runs.
- CI runs `npm audit` and `npm audit signatures` on every push; Dependabot and CodeQL watch the code.

## Settings to turn on (repository owner)

GitHub → Settings → Code security: enable **Dependabot alerts**, **Dependabot security updates**,
**Secret scanning** with **Push protection**, and **Private vulnerability reporting**.
Settings → Branches: protect `main` (require the CI check, block force pushes).
