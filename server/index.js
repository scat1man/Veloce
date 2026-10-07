// Entry point: read the config, build the app, listen. Everything else is in app.js.
import { createApp } from './app.js'
import { ConfigError } from './config.js'

let instance
try {
  instance = createApp()
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`\nVELOCE refused to start: ${err.message}\n`)
    process.exit(1)
  }
  throw err
}

const { app, config, close } = instance
const server = app.listen(config.port, () => {
  console.log(`VELOCE ${config.production ? '(production) ' : ''}on http://localhost:${config.port}`)
  console.log(`Concierge admin: http://localhost:${config.port}/admin`)
  if (config.usingDevPassword)
    console.warn(`WARNING: admin password is the demo default "veloce". Set ADMIN_PASSWORD before putting this online (production refuses to start without it).`)
})

const shutdown = () => {
  server.close(() => {
    close()
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 5000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
