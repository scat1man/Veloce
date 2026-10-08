// Entry point: read the config, build the app, listen. Everything else is in app.js.
import { createApp } from './app.js'
import { ConfigError, loadConfig } from './config.js'
import { createTursoClient, restoreFromTurso } from './replica.js'

const refuse = (err) => {
  if (!(err instanceof ConfigError)) throw err
  console.error(`\nVELOCE refused to start: ${err.message}\n`)
  process.exit(1)
}

let instance
try {
  // With Turso set up, the local database is rebuilt from it first: on hosts that wipe the disk
  // on every restart, this is how bookings, accounts and the activity log come back.
  const { turso, dataDir } = loadConfig()
  if (turso) {
    try {
      await restoreFromTurso(createTursoClient(turso), dataDir)
    } catch (err) {
      console.error(`\nVELOCE refused to start: could not read the database from Turso (${err.message}). Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.\n`)
      process.exit(1)
    }
  }
  instance = createApp()
} catch (err) {
  refuse(err)
}

const { app, config, close, flush } = instance
const server = app.listen(config.port, () => {
  console.log(`VELOCE ${config.production ? '(production) ' : ''}on http://localhost:${config.port}`)
  console.log(`Concierge admin: http://localhost:${config.port}/admin`)
  if (config.usingDevPassword)
    console.warn(`WARNING: admin password is the demo default "veloce". Set ADMIN_PASSWORD before putting this online (production refuses to start without it).`)
})
// Slow-client protection: a connection that dribbles its headers or body is cut off
// instead of holding a socket open for minutes.
server.headersTimeout = 20_000
server.requestTimeout = 30_000
server.keepAliveTimeout = 65_000 // a little above the proxy's idle timeout, so it never reuses a closed socket
server.maxHeadersCount = 100

const shutdown = () => {
  server.close(async () => {
    // Changes still on their way to Turso get a few seconds to arrive before the process ends.
    await flush()
    close()
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 20_000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
