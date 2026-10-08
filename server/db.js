// SQLite through Node's built-in driver: no extra package, and the whole database
// is one file (DATA_DIR/veloce.db, default server/data/) you can open with any SQLite viewer.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function openDb(dataDir) {
  mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(join(dataDir, 'veloce.db'))
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;')

  // Runs on every start; IF NOT EXISTS makes it a no-op once the tables are there.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      reference   TEXT    NOT NULL UNIQUE,
      vehicle_id  TEXT,                 -- NULL means "no preference, advise me"
      city_id     TEXT    NOT NULL,
      pickup      TEXT    NOT NULL,     -- YYYY-MM-DD
      return_date TEXT    NOT NULL,     -- YYYY-MM-DD, the day the car is handed back
      name        TEXT    NOT NULL,
      email       TEXT    NOT NULL,     -- stored lowercase
      status      TEXT    NOT NULL DEFAULT 'pending',  -- pending | confirmed | cancelled
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS bookings_vehicle ON bookings (vehicle_id, pickup);
    CREATE INDEX IF NOT EXISTS bookings_return ON bookings (return_date);

    -- Admin sessions: the cookie holds a random id, only its SHA-256 hash is stored here.
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash     TEXT    PRIMARY KEY,
      expires_at  INTEGER NOT NULL,     -- unix ms
      created_at  INTEGER NOT NULL
    );
  `)
  // Columns added after the first release: add them to older databases on start.
  const columns = new Set(db.prepare('PRAGMA table_info(bookings)').all().map((c) => c.name))
  if (!columns.has('note')) db.exec("ALTER TABLE bookings ADD COLUMN note TEXT NOT NULL DEFAULT ''") // staff-only
  if (!columns.has('updated_at')) db.exec('ALTER TABLE bookings ADD COLUMN updated_at TEXT')

  // What staff did in the concierge, kept so the console can show an activity log
  // and each booking's history. Purged with the same retention as bookings.
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      at          TEXT    NOT NULL DEFAULT (datetime('now')),
      event       TEXT    NOT NULL,     -- login_ok, login_failed, status_change, note_saved, ...
      reference   TEXT,                 -- the booking it concerns, if any
      detail      TEXT    NOT NULL DEFAULT '',
      ip          TEXT
    );
    CREATE INDEX IF NOT EXISTS admin_events_ref ON admin_events (reference);
  `)

  // Visitor analytics (analytics.js): no cookies, no raw IPs. `visitor` is a hash with a salt that
  // changes daily, so it means "the same browser today" and nothing more. Purged with RETENTION_DAYS.
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      at          TEXT    NOT NULL DEFAULT (datetime('now')),
      day         TEXT    NOT NULL,     -- YYYY-MM-DD (UTC)
      visitor     TEXT    NOT NULL,     -- 16 hex chars of sha256(daily salt, ip, user agent)
      kind        TEXT    NOT NULL,     -- pageview | section | car | booking_start | booking
      name        TEXT,                 -- section id or car id
      source      TEXT,                 -- pageviews only: Google, Instagram, Direct, ...
      device      TEXT                  -- Desktop | Phone | Tablet
    );
    CREATE INDEX IF NOT EXISTS analytics_day ON analytics_events (day, kind);
    CREATE INDEX IF NOT EXISTS analytics_visitor ON analytics_events (day, visitor, kind, name);
    CREATE TABLE IF NOT EXISTS analytics_salts (
      day         TEXT    PRIMARY KEY,
      salt        TEXT    NOT NULL
    );
  `)

  // Older databases may hold mixed-case emails; lookups compare lowercase.
  db.exec('UPDATE bookings SET email = lower(email) WHERE email != lower(email)')
  return db
}
