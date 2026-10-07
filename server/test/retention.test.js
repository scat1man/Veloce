import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { createApp } from '../app.js'
import { openDb } from '../db.js'

test('startup removes bookings returned over 180 days ago and expired sessions; old references still resolve', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'veloce-ret-'))
  try {
    const db = openDb(dataDir)
    const ins = db.prepare("INSERT INTO bookings (reference, vehicle_id, city_id, pickup, return_date, name, email) VALUES (?, 'sf90', 'la', ?, ?, 'X', 'Old@Example.com')")
    ins.run('VLC-OLD01', '2020-01-01', '2020-01-03')
    const recent = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10)
    ins.run('VLC-AB12C', recent, recent)
    db.prepare('INSERT INTO sessions (id_hash, expires_at, created_at) VALUES (?, ?, ?)').run('dead', 1, 0)
    db.close()

    const logs = []
    const { close } = createApp({ processEnv: {}, dataDir, distDir: join(dataDir, 'none/'), log: (l) => logs.push(l) })
    close()

    const check = new DatabaseSync(join(dataDir, 'veloce.db'))
    const refs = check.prepare('SELECT reference, email FROM bookings').all()
    assert.deepEqual(refs.map((r) => r.reference), ['VLC-AB12C']) // old 5-character references keep working
    assert.equal(refs[0].email, 'old@example.com')
    assert.equal(check.prepare('SELECT count(*) AS n FROM sessions').get().n, 0)
    check.close()
    assert.ok(logs.some((l) => l.includes('[retention] removed 1 booking')))
  } finally {
    rmSync(dataDir, { recursive: true, force: true })
  }
})
