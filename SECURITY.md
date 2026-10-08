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

**Requests**
- CSRF: state-changing admin calls must come from the site's own origin and carry JSON.
- Rate limits on every API, per IP, plus a site-wide cap on new bookings.
- Strict input validation (known cars and cities, real dates, HTML-standard emails, no markup or
  invisible direction characters in names), parameterised SQL, JSON bodies capped at 10 KB.
- Output is escaped in the console; CSV exports neutralise spreadsheet formulas.
- No file uploads anywhere, so there is no way to upload malware to the server.

**Headers**
- Content Security Policy: scripts only from the site itself; a tighter policy on the admin pages and a
  sandbox on API answers. HSTS (2 years), `X-Frame-Options: DENY`, `nosniff`, COOP/CORP, Permissions-Policy.
- Dotfiles (`.env`, `.git`) are never served. No stack traces or `X-Powered-By`.
- Slow-client timeouts on the HTTP server.

**Supply chain**
- `.npmrc` turns off dependency install scripts, the usual way npm malware runs.
- CI runs `npm audit` and `npm audit signatures` on every push; Dependabot and CodeQL watch the code.

## Settings to turn on (repository owner)

GitHub → Settings → Code security: enable **Dependabot alerts**, **Dependabot security updates**,
**Secret scanning** with **Push protection**, and **Private vulnerability reporting**.
Settings → Branches: protect `main` (require the CI check, block force pushes).
