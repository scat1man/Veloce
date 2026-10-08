// Shared by the test files: start the app on a random port with its own temporary data folder.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../app.js'

export const PASSWORD = 'correct horse battery staple'

export async function start(options = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'veloce-test-'))
  const logs = []
  const { app, close } = createApp({
    processEnv: {},
    adminPassword: PASSWORD,
    dataDir,
    distDir: join(dataDir, 'no-dist/'),
    log: (line) => logs.push(line),
    ...options,
  })
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    base,
    logs,
    dataDir,
    async close() {
      await new Promise((resolve) => server.close(resolve))
      server.closeAllConnections?.()
      close()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

export const isoDay = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)

export const booking = (overrides = {}) => ({
  vehicleId: 'sf90',
  cityId: 'mia',
  pickup: isoDay(10),
  returnDate: isoDay(13),
  name: 'Ada Lovelace',
  email: 'Ada@Example.com',
  ...overrides,
})

export const postJson = (url, body, headers = {}) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
