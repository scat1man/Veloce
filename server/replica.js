// Keeps the SQLite database safe on hosts whose disk is wiped on every restart (Render's free plan).
//
// The site keeps running on its local SQLite file, exactly as before: every read is local and fast.
// When TURSO_DATABASE_URL is set, each change is also sent, in order, to a Turso database (hosted
// SQLite, free tier), and on start the local file is rebuilt from Turso before the site opens.
// Turso is therefore the copy that lasts; the local file is a working copy.
//
// It speaks Turso's HTTP protocol ("Hrana over HTTP", POST /v2/pipeline) with plain fetch,
// so no extra package is needed.
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const BATCH = 100
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** libsql://name-org.turso.io (as Turso shows it) or https://… -> the HTTPS base URL. */
export function tursoHttpUrl(url) {
  const parsed = new URL(url.trim().replace(/^libsql:\/\//, 'https://').replace(/^wss:\/\//, 'https://'))
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)))
    throw new Error('must be a libsql:// or https:// address')
  return parsed.origin
}

// ---- Values: JavaScript <-> Hrana ----

function toValue(v) {
  if (v === null || v === undefined) return { type: 'null' }
  if (typeof v === 'bigint') return { type: 'integer', value: v.toString() }
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v }
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' }
  if (v instanceof Uint8Array) return { type: 'blob', base64: Buffer.from(v).toString('base64') }
  return { type: 'text', value: String(v) }
}

function fromValue(v) {
  switch (v?.type) {
    case 'integer': {
      const n = BigInt(v.value)
      return n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n
    }
    case 'float':
      return Number(v.value)
    case 'text':
      return v.value
    case 'blob':
      return Buffer.from(v.base64 ?? '', 'base64')
    default:
      return null
  }
}

/** A tiny Turso client: send a pipeline of requests, get their results. */
export function createTursoClient({ url, token, fetchImpl = fetch }) {
  const endpoint = `${tursoHttpUrl(url)}/v2/pipeline`
  return {
    async pipeline(requests) {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ baton: null, requests: [...requests, { type: 'close' }] }),
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) throw new Error(`Turso answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
      return (await res.json()).results
    },
    /** One query, returning rows as objects. Throws on an SQL error. */
    async query(sql, args = []) {
      const [result] = await this.pipeline([{ type: 'execute', stmt: { sql, args: args.map(toValue) } }])
      if (result?.type !== 'ok') throw new Error(`Turso: ${result?.error?.message ?? 'no result'}`)
      const { cols, rows } = result.response.result
      return rows.map((row) => Object.fromEntries(cols.map((c, i) => [c.name, fromValue(row[i])])))
    },
  }
}

// ---- On start: rebuild the local file from Turso ----

const INTERNAL = /^(sqlite_|libsql_|_litestream|_cf_)/
const quote = (name) => `"${name.replace(/"/g, '""')}"`

/**
 * Replaces DATA_DIR/veloce.db with the contents of the Turso database.
 * Returns the number of rows copied. Retries a few times, then throws: starting with an empty
 * copy while Turso holds the real data would show guests and staff the wrong picture.
 */
export async function restoreFromTurso(client, dataDir, { log = console.log, attempts = 4 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await restoreOnce(client, dataDir, log)
    } catch (err) {
      if (attempt >= attempts) throw err
      log(`[turso] restore failed (${err.message}), retrying`)
      await sleep(1000 * 2 ** attempt)
    }
  }
}

async function restoreOnce(client, dataDir, log) {
  const schema = (await client.query("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid")).filter(
    (s) => !INTERNAL.test(s.name),
  )
  // Read everything first, so a failure half-way never leaves a half-built local file behind.
  const tables = []
  for (const { name } of schema.filter((s) => s.type === 'table')) {
    const rows = []
    for (let offset = 0; ; offset += 5000) {
      const page = await client.query(`SELECT * FROM ${quote(name)} ORDER BY rowid LIMIT 5000 OFFSET ${offset}`)
      rows.push(...page)
      if (page.length < 5000) break
    }
    tables.push({ name, rows })
  }
  // AUTOINCREMENT counters: without them, a row deleted at the end would make the next id
  // differ between the local copy and Turso.
  const sequences = await client.query('SELECT name, seq FROM sqlite_sequence').catch((err) => (/no such table/i.test(err.message) ? [] : Promise.reject(err)))

  const file = join(dataDir, 'veloce.db')
  for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true })
  const db = new DatabaseSync(file)
  let copied = 0
  try {
    db.exec('BEGIN')
    for (const { sql } of schema) db.exec(sql)
    for (const { name, rows } of tables) {
      if (!rows.length) continue
      const cols = Object.keys(rows[0])
      const insert = db.prepare(`INSERT INTO ${quote(name)} (${cols.map(quote).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      for (const row of rows) insert.run(...cols.map((c) => row[c]))
      copied += rows.length
    }
    for (const { name, seq } of sequences) {
      if (db.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(seq, name).changes === 0)
        db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(name, seq)
    }
    db.exec('COMMIT')
  } finally {
    db.close()
  }
  log(`[turso] restored ${copied} row(s) in ${tables.length} table(s) from Turso`)
  return copied
}

// ---- While running: copy every change to Turso, in order ----

const stripComments = (sql) => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
const firstWord = (sql) => stripComments(sql).trim().split(/\s/, 1)[0].toUpperCase()
const WRITES = new Set(['INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'CREATE', 'ALTER', 'DROP'])
const isWrite = (sql) => WRITES.has(firstWord(sql)) || (firstWord(sql) === 'WITH' && /\b(INSERT|UPDATE|DELETE)\b/i.test(sql))

/**
 * Wraps a node:sqlite database so that every statement that changes data, once it has
 * succeeded locally, is queued for Turso. Reads are untouched. Returns an object with the same
 * prepare/exec/close the rest of the server uses, plus flush() and pending().
 */
export function replicate(db, client, { log = console.log } = {}) {
  const queue = []
  let draining = null
  let failures = 0

  const enqueue = (request) => {
    queue.push(request)
    draining ??= drain().finally(() => (draining = null))
  }

  async function drain() {
    while (queue.length) {
      const batch = queue.slice(0, BATCH)
      try {
        // One transaction per batch: Turso applies it whole, in the order the site made the changes.
        const results = await client.pipeline([{ type: 'execute', stmt: { sql: 'BEGIN' } }, ...batch, { type: 'execute', stmt: { sql: 'COMMIT' } }])
        results.forEach((r, i) => {
          if (r?.type === 'error') log(`[turso] a change was refused: ${r.error?.message} (${JSON.stringify(batch[i - 1]?.stmt?.sql ?? batch[i - 1]?.sql ?? '').slice(0, 120)})`)
        })
        queue.splice(0, batch.length)
        failures = 0
      } catch (err) {
        // Network trouble: keep the changes and try again, waiting a little longer each time.
        failures++
        log(`[turso] could not save ${queue.length} change(s) yet: ${err.message}`)
        await sleep(Math.min(60_000, 500 * 2 ** failures))
      }
    }
  }

  const wrapStatement = (sql, stmt) => {
    const send = (args) => enqueue({ type: 'execute', stmt: { sql, args: args.map(toValue) } })
    return {
      run(...args) {
        const result = stmt.run(...args)
        // A change that changed nothing here changes nothing in Turso either: skip the round trip.
        if (Number(result.changes) > 0 || !['INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(firstWord(sql))) send(args)
        return result
      },
      // INSERT … RETURNING is read with get()/all().
      get(...args) {
        const row = stmt.get(...args)
        send(args)
        return row
      },
      all(...args) {
        const rows = stmt.all(...args)
        send(args)
        return rows
      },
    }
  }

  return {
    prepare(sql) {
      const stmt = db.prepare(sql)
      return isWrite(sql) ? wrapStatement(sql, stmt) : stmt
    },
    exec(sql) {
      db.exec(sql)
      // PRAGMAs tune this connection only (journal mode, foreign keys); Turso manages its own.
      const rest = stripComments(sql).replace(/\bPRAGMA\b[^;]*;?/gi, '').trim()
      if (rest) enqueue({ type: 'sequence', sql: rest })
    },
    close: () => db.close(),
    pending: () => queue.length,
    /** Waits until every change so far has reached Turso (or `timeoutMs` passes). */
    async flush(timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs
      while (queue.length && Date.now() < deadline) await Promise.race([draining ?? sleep(50), sleep(Math.max(0, deadline - Date.now()))])
      return queue.length === 0
    },
  }
}
