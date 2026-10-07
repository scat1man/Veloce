import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ConfigError, loadConfig } from '../config.js'

const entry = fileURLToPath(new URL('../index.js', import.meta.url))

test('production refuses a missing, default or short ADMIN_PASSWORD', () => {
  for (const ADMIN_PASSWORD of [undefined, '', 'veloce', 'short-pass1']) {
    assert.throws(() => loadConfig({ NODE_ENV: 'production', ...(ADMIN_PASSWORD === undefined ? {} : { ADMIN_PASSWORD }) }), ConfigError)
  }
  const ok = loadConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: 'a-long-enough-secret' })
  assert.equal(ok.production, true)
  assert.equal(ok.trustProxy, 1)
  assert.equal(ok.forceHttps, true)
})

test('development falls back to the demo password', () => {
  const dev = loadConfig({})
  assert.equal(dev.adminPassword, 'veloce')
  assert.equal(dev.usingDevPassword, true)
  assert.equal(dev.trustProxy, false)
  assert.equal(loadConfig({ TRUST_PROXY: '2' }).trustProxy, 2)
  assert.equal(loadConfig({ DATA_DIR: '/var/data' }).dataDir, '/var/data')
})

test('the real entry point exits with a clear message on a weak production password', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'veloce-cfg-'))
  try {
    const run = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', entry], {
      env: { ...process.env, NODE_ENV: 'production', ADMIN_PASSWORD: 'veloce', DATA_DIR: dataDir, PORT: '0' },
      encoding: 'utf8',
      timeout: 10_000,
    })
    assert.equal(run.status, 1)
    assert.match(run.stderr, /refused to start: ADMIN_PASSWORD/)
  } finally {
    rmSync(dataDir, { recursive: true, force: true })
  }
})

test('ADMIN_PASSWORD is trimmed, so a pasted trailing space or newline does not lock staff out', async () => {
  const { passwordMatches } = await import('../auth.js')
  const config = loadConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: '  long-enough-secret\n' })
  assert.equal(config.adminPassword, 'long-enough-secret')
  assert.ok(passwordMatches('long-enough-secret', config.adminPassword))
  assert.ok(passwordMatches(' long-enough-secret ', config.adminPassword))
  assert.ok(!passwordMatches('   ', config.adminPassword))
  assert.throws(() => loadConfig({ NODE_ENV: 'production', ADMIN_PASSWORD: '   ' }), ConfigError)
})
