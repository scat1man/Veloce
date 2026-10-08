// Prints an ADMIN_PASSWORD_HASH for the password you type, so the password itself never has
// to be stored in the host's settings. Usage: npm run hash-password
import { createInterface } from 'node:readline'
import { hashPassword } from '../server/auth.js'

const MIN = 12
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY })
// Hide what is typed when this is a real terminal.
if (process.stdin.isTTY) rl._writeToOutput = (text) => rl.output.write(text.includes('\n') ? '\n' : text.startsWith('Admin') ? text : '')

rl.question('Admin password (at least 12 characters): ', (password) => {
  rl.close()
  const value = password.trim()
  if (value.length < MIN) {
    console.error(`\nToo short (${value.length} characters). Use at least ${MIN}.`)
    process.exit(1)
  }
  console.log(`\nSet this as ADMIN_PASSWORD_HASH on your host, then remove ADMIN_PASSWORD:\n\n${hashPassword(value)}\n`)
})
