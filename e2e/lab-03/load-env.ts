import fs from 'node:fs'
import path from 'node:path'

// Playwright runs from the repo root, but the database settings live in
// server/.env (git-ignored). Load them before anything imports the server's
// Prisma client. Values are only put into process.env — never printed.
const file = path.resolve(__dirname, '../../server/.env')
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!match || process.env[match[1]] !== undefined) continue
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}
