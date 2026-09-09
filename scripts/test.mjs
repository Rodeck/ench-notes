/* `npm test` entry: frees leftover emulator ports, then runs the suites
   under `firebase emulators:exec` (which starts and stops the emulators).
     node scripts/test.mjs            rules + backend/MCP e2e
     node scripts/test.mjs --rules    rules only
     node scripts/test.mjs --e2e      e2e only */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMULATOR_PORTS, ensurePortsFree } from './lib/ports.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const only = process.argv.find((a) => a === '--rules' || a === '--e2e')

await ensurePortsFree({ ...EMULATOR_PORTS, e2eBackend: 8798 }, 'test')

const services = only === '--rules' ? 'firestore' : 'auth,firestore'
const inner = `node scripts/run-tests.mjs${only ? ` ${only}` : ''}`
// One string through the shell so the quoted inner command survives on Windows.
const cmd = `firebase emulators:exec --only ${services} "${inner}"`
const r = spawnSync(cmd, { cwd: root, stdio: 'inherit', shell: true })
if (r.error) console.error(r.error.message)
process.exit(r.status ?? 1)
