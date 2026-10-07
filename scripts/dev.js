// Starts the backend and the frontend together for local development.
// Both print to this terminal; Ctrl+C stops both.
import { spawn } from 'node:child_process'

const children = ['dev:server', 'dev:client'].map((script) => spawn('npm', ['run', script], { stdio: 'inherit', shell: true }))

const stop = () => children.forEach((child) => child.kill())
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
children.forEach((child) => child.on('exit', (code) => code && stop()))
