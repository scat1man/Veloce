// Turso replication: every change reaches the remote copy, and a wiped disk is rebuilt from it.
// Turso itself is replaced by a small fake that speaks its HTTP protocol over an in-memory SQLite.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, test } from 'node:test'
import { createApp } from '../app.js'
import { ConfigError, loadConfig } from '../config.js'
import { createTursoClient, restoreFromTurso, tursoHttpUrl } from '../replica.js'
import { PASSWORD, booking, postJson } from './helpers.js'

const toHrana = (v) =>
  v === null ? { type: 'null' } : typeof v === 'number' ? (Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v }) : typeof v === 'bigint' ? { type: 'integer', value: String(v) } : { type: 'text', value: String(v) }
const fromHrana = (v) => (v.type === 'null' ? null : v.type === 'integer' ? Number(v.value) : v.value)

/** A stand-in for Turso: POST /v2/pipeline against its own SQLite database. */
function fakeTurso() {
  const db = new DatabaseSync(':memory:')
  const seen = []
  const turso = {
    db,
    seen,
    logs: [],
    down: false,
    async fetch(url, init) {
      assert.equal(url, 'https://veloce-test.turso.io/v2/pipeline')
      assert.equal(init.headers.Authorization, 'Bearer secret-token')
      if (turso.down) throw new Error('network down')
      const { requests } = JSON.parse(init.body)
      const results = requests.map((r) => {
        try {
          if (r.type === 'close') return { type: 'ok', response: { type: 'close' } }
          if (r.type === 'sequence') {
            seen.push(r.sql)
            db.exec(r.sql)
            return { type: 'ok', response: { type: 'sequence' } }
          }
          seen.push(r.stmt.sql)
          const rows = db.prepare(r.stmt.sql).all(...(r.stmt.args ?? []).map(fromHrana))
          const cols = rows[0] ? Object.keys(rows[0]).map((name) => ({ name })) : []
          return { type: 'ok', response: { type: 'execute', result: { cols, rows: rows.map((row) => cols.map((c) => toHrana(row[c.name]))), affected_row_count: 0 } } }
        } catch (err) {
          return { type: 'error', error: { message: err.message } }
        }
      })
      return new Response(JSON.stringify({ baton: null, results }), { headers: { 'Content-Type': 'application/json' } })
    },
  }
  return turso
}

const settings = { url: 'libsql://veloce-test.turso.io', token: 'secret-token' }

async function boot(turso, dataDir) {
  const { app, close, flush } = createApp({ processEnv: {}, adminPassword: PASSWORD, dataDir, distDir: join(dataDir, 'no-dist/'), log: (l) => turso.logs?.push(l), turso: settings, fetch: turso.fetch })
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    flush,
    async stop() {
      await new Promise((resolve) => server.close(resolve))
      server.closeAllConnections?.()
      close()
    },
  }
}

describe('Turso', () => {
  test('bookings survive a wiped disk: saved to Turso, restored on the next start', async () => {
    const turso = fakeTurso()
    const first = mkdtempSync(join(tmpdir(), 'veloce-turso-'))
    let site = await boot(turso, first)
    const res = await postJson(`${site.base}/api/bookings`, booking())
    assert.equal(res.status, 201)
    const { reference } = await res.json()
    assert.equal(await site.flush(), true)
    await site.stop()
    rmSync(first, { recursive: true, force: true })
    assert.equal(turso.db.prepare('SELECT count(*) AS n FROM bookings').get().n, 1)
    // Nothing was refused, and connection PRAGMAs stay local.
    assert.deepEqual(turso.logs.filter((l) => l.includes('refused')), [])
    assert.ok(!turso.seen.some((sql) => /PRAGMA/i.test(sql)))

    // A brand-new, empty disk, as after a Render restart.
    const second = mkdtempSync(join(tmpdir(), 'veloce-turso-'))
    const client = createTursoClient({ ...settings, fetchImpl: turso.fetch })
    assert.ok((await restoreFromTurso(client, second, { log: () => {} })) >= 1)
    site = await boot(turso, second)
    const found = await postJson(`${site.base}/api/bookings/lookup`, { reference, email: 'ada@example.com' })
    assert.equal(found.status, 200)
    assert.equal((await found.json()).vehicle, 'Ferrari SF90 Stradale')

    // Changes after the restore keep flowing, with ids that match on both sides.
    assert.equal((await postJson(`${site.base}/api/bookings`, booking({ vehicleId: 'db12' }))).status, 201)
    await site.flush()
    const ids = (db) => db.prepare('SELECT id, reference FROM bookings ORDER BY id').all().map((r) => `${r.id}:${r.reference}`)
    const local = new DatabaseSync(join(second, 'veloce.db'))
    assert.deepEqual(ids(local), ids(turso.db))
    local.close()
    await site.stop()
    rmSync(second, { recursive: true, force: true })
  })

  test('while Turso is unreachable, changes wait and are sent once it is back', async () => {
    const turso = fakeTurso()
    const dir = mkdtempSync(join(tmpdir(), 'veloce-turso-'))
    const site = await boot(turso, dir)
    await site.flush()
    turso.down = true
    assert.equal((await postJson(`${site.base}/api/bookings`, booking())).status, 201)
    assert.equal(await site.flush(300), false)
    turso.down = false
    assert.equal(await site.flush(10_000), true)
    assert.equal(turso.db.prepare('SELECT count(*) AS n FROM bookings').get().n, 1)
    await site.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  test('ids stay in step after the newest row was deleted', async () => {
    const turso = fakeTurso()
    turso.db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT); INSERT INTO items (label) VALUES ('a'), ('b'), ('c'); DELETE FROM items WHERE label = 'c'")
    const dir = mkdtempSync(join(tmpdir(), 'veloce-turso-'))
    await restoreFromTurso(createTursoClient({ ...settings, fetchImpl: turso.fetch }), dir, { log: () => {} })
    const local = new DatabaseSync(join(dir, 'veloce.db'))
    const next = (db) => db.prepare("INSERT INTO items (label) VALUES ('d') RETURNING id").get().id
    assert.equal(next(local), next(turso.db))
    local.close()
    rmSync(dir, { recursive: true, force: true })
  })

  test('settings: URL and token come as a pair', () => {
    assert.equal(tursoHttpUrl('libsql://veloce-me.turso.io'), 'https://veloce-me.turso.io')
    assert.throws(() => loadConfig({ TURSO_DATABASE_URL: 'libsql://x.turso.io' }), ConfigError)
    assert.throws(() => loadConfig({ TURSO_DATABASE_URL: 'ftp://x', TURSO_AUTH_TOKEN: 't' }), ConfigError)
    assert.deepEqual(loadConfig({ TURSO_DATABASE_URL: ' libsql://x.turso.io ', TURSO_AUTH_TOKEN: 't' }).turso, { url: 'libsql://x.turso.io', token: 't' })
    assert.equal(loadConfig({}).turso, null)
  })
})
