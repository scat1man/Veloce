# VELOCÉ — Drive the Exceptional

A cinematic, single-page demo site for a **fictional** performance-car rental brand.
React 19 · TypeScript · Vite · Tailwind CSS v4 · Motion (`motion/react`) · Lucide.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

> VELOCÉ is a fictional demonstration brand. Vehicle manufacturers and trademarks belong to their respective owners. Photography: Unsplash contributors (credited per image in `src/data/images.ts`).

## Structure

```
src/
  animations/   tokens.ts (easings, durations, springs, hero timeline), variants.ts,
                RevealText (masked line reveals), Reveal, RevealImage
  components/   Navbar, MobileMenu, Button, SmartImage, VehicleCard, VehicleDetail,
                BookingPanel, DotMap, StatFigure, ChapterFrame, CursorLabel, SectionLabel, Wordmark
  sections/     Hero, FleetSection, ExperienceSection, PerformanceSection,
                LocationsSection, FinalCTA, Footer
  data/         images.ts (image registry), vehicles.ts, locations.ts, content.ts
  hooks/        useMediaQuery, useNavState, useScrollLock, useSite (booking context), scrollTo
  styles/       index.css (design tokens + type scale)
public/images/  locally hosted WebP photography (960w + 2000w per image)
```

## Design system (summary)

| | |
|---|---|
| Display | Archivo, condensed (`font-stretch: 68%`), uppercase, leading 0.84 |
| Wordmark | Archivo, expanded (125%), tracked 0.2em |
| Metadata | IBM Plex Mono 11px, uppercase, tracked 0.14em |
| Pull quotes | Instrument Serif italic — only for quotes |
| Colour | ink `#0b0b0a`, graphite `#131312`, bone `#ebe7df`, paper `#f1eee8`, stone `#8f8b83`, ash `#5c5952`, one accent: ember `#e2592c` (dots/indicators only) |
| Grid | 12 columns; gutters 20 / 40 / 56px; hairline (1px) dividers; no rounded cards |
| Motion | expo-out reveals (0.9–1.15s), in-out masks/wipes, damped springs for UI (0.3–0.45s) |

Light (paper) and dark (ink/graphite) chapters alternate. Dark chapters open from an inset frame (`ChapterFrame`), the fleet slides over the sticky hero like a curtain, and the final CTA's lockup echoes the hero.

## Replacing imagery

Every photo is declared once in `src/data/images.ts`:

```ts
gt3Sunset: img('gt3rs-sunset', 'alt text', 'Photographer', '46% 60%' /* crop */, '66% 50%' /* mobile crop */)
```

Drop `<name>-960.webp` and `<name>-2000.webp` into `public/images/` (or change `img()` to point at a CDN). If a file is missing, `SmartImage` renders a designed placeholder instead of a broken image.

Vehicles (`src/data/vehicles.ts`) reference images from the registry, so swapping a car is a data-only change.

## Accessibility & motion

- `MotionConfig reducedMotion="user"` drops transform/layout animation; parallax, drift and the hero entrance are disabled explicitly for reduced-motion users.
- Dialogs (vehicle detail, booking, mobile menu) lock scroll, close on <kbd>Esc</kbd>, move focus in and restore it on close. Vehicle detail supports <kbd>←</kbd>/<kbd>→</kbd> and swipe.
- The custom "View" cursor appears only over fleet imagery on precise pointers; touch devices get always-visible specs and tap-to-open.

## Backend

The booking form ("Book a drive"), the "Manage a booking" lookup and the concierge admin are served by a small Express API with SQLite (Node's built-in `node:sqlite`, so Node 22.13+). No other database or service is needed.

```bash
npm install
npm run dev      # site on http://localhost:5173, API on http://localhost:3001
npm run prod     # build, then one server for site + API on http://localhost:3001
npm test         # backend tests (node:test)
```

Hosting it for free: see [DEPLOY.md](DEPLOY.md).

```
server/
  index.js      entry point: starts the server, clean shutdown
  app.js        createApp(): routes, static hosting of dist/, error handling
  config.js     environment variables and the production safety check
  security.js   security headers (CSP etc.), rate limiting, HTTPS redirect
  auth.js       admin sign-in, sessions, CSRF checks
  bookings.js   validation, overlap check, database queries
  db.js         opens $DATA_DIR/veloce.db, creates tables, retention clean-up
  catalog.js    bookable car and city ids (mirror of src/data)
  admin.html, login.html, public/   concierge pages at /admin
  test/         node:test suites
src/api.ts      the frontend's fetch helpers
```

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/bookings` | Create a request: 201 with the reference, 400 invalid, 409 car already booked, 429 too many |
| GET | `/api/availability?vehicleId&pickup&returnDate` | `{ available }`, checked live by the form |
| POST | `/api/bookings/lookup` | `{ reference, email }` → status of that booking (both must match) |
| POST | `/api/admin/login` · `/api/admin/logout` | Admin session (HttpOnly cookie) |
| GET | `/api/admin/bookings` | All bookings (admin) |
| PATCH | `/api/admin/bookings/:reference` | `{ status: pending \| confirmed \| cancelled }` (admin) |

### Security

- Admin: sign-in page with a session cookie (HttpOnly, SameSite=Strict, Secure on HTTPS), 8-hour sessions, 5 failed attempts per 15 min per IP, constant-time password check, audit lines in the server log.
- CSRF: state-changing admin requests must come from the same origin and send JSON.
- Spam and abuse: hidden honeypot field on the booking form, per-IP rate limits on bookings, lookups and availability.
- Privacy: a booking can only be looked up with its reference **and** email; references are 8 random characters; old bookings are deleted 180 days after return.
- Headers: Content-Security-Policy, HSTS (production over HTTPS), nosniff, frame blocking, referrer and permissions policies.
- Production refuses to start without a strong `ADMIN_PASSWORD`.

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | | `production` on the host |
| `ADMIN_PASSWORD` | `veloce` in development | Required in production: 12+ characters |
| `PORT` | 3001 | Set by the host |
| `DATA_DIR` | `server/data` | Point at a persistent disk if the host has one |
| `TRUST_PROXY` | 1 in production | Proxy hops in front of the app (2 behind Cloudflare + host) |
| `FORCE_HTTPS` | on in production | `false` to disable the redirect |
| `SESSION_HOURS` / `RETENTION_DAYS` | 8 / 180 | |
