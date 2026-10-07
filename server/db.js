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
  // Older databases may hold mixed-case emails; lookups compare lowercase.
  db.exec('UPDATE bookings SET email = lower(email) WHERE email != lower(email)')
  return db
}
