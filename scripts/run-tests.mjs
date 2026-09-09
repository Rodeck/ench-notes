/* Runs the emulator-backed test suites in sequence. Meant to be started by
   `firebase emulators:exec` (see the root package.json), which sets
   FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST for us.
     node scripts/run-tests.mjs          rules + backend/MCP e2e
     node scripts/run-tests.mjs --rules  rules only
     node scripts/run-tests.mjs --e2e    e2e only */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const only = process.argv.find((a) => a === '--rules' || a === '--e2e')

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is not set — run this through `npm test` (firebase emulators:exec).')
  process.exit(1)
}

const suites = [
  {
    name: 'Firestore rules',
    flag: '--rules',
    cmd: process.execPath,
    args: [path.join(root, 'frontend', 'tests', 'firestore-rules.test.mjs')],
    cwd: root,
  },
  {
    name: 'Backend + MCP e2e',
    flag: '--e2e',
    cmd: process.execPath,
    args: ['--import', 'tsx', path.join('tests', 'e2e.test.ts')],
    cwd: path.join(root, 'backend'),
  },
]

let failed = 0
for (const s of suites) {
  if (only && only !== s.flag) continue
  console.log(`\n=== ${s.name} ===`)
  const r = spawnSync(s.cmd, s.args, { cwd: s.cwd, stdio: 'inherit', env: process.env })
  if (r.status !== 0) failed++
}
process.exit(failed ? 1 : 0)
