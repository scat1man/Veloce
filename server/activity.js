// The concierge activity log: sign-ins and every change staff make, kept in SQLite (table
// admin_events, see db.js) so the console can show it. app.js's audit() writes to it.
const MAX_ROWS = 5000

export function createActivityLog(db) {
  const insert = db.prepare('INSERT INTO admin_events (event, reference, detail, ip) VALUES (?, ?, ?, ?)')
  const recent = db.prepare('SELECT * FROM admin_events ORDER BY id DESC LIMIT ?')
  const forBooking = db.prepare('SELECT * FROM admin_events WHERE reference = ? ORDER BY id DESC LIMIT 100')
  const purgeOld = db.prepare("DELETE FROM admin_events WHERE at < datetime('now', ?)")
  // Keeps the table bounded even if someone hammers the sign-in form from many addresses.
  const trim = db.prepare('DELETE FROM admin_events WHERE id <= (SELECT id FROM admin_events ORDER BY id DESC LIMIT 1 OFFSET ?)')

  const toJson = (row) => ({ id: row.id, at: row.at, event: row.event, reference: row.reference, detail: row.detail, ip: row.ip })
  let writes = 0

  return {
    record(event, { reference = null, detail = '', ip = null } = {}) {
      insert.run(event, reference, String(detail).slice(0, 500), ip)
      if (++writes % 100 === 0) trim.run(MAX_ROWS)
    },
    recent: (limit = 200) => recent.all(Math.min(Math.max(1, limit), 500)).map(toJson),
    forBooking: (reference) => forBooking.all(reference).map(toJson),
    purge: (days) => Number(purgeOld.run(`-${Math.floor(days)} days`).changes),
  }
}
