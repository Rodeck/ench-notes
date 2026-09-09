#!/usr/bin/env node
/* One-command local stack:
     npm run dev          emulators (Auth + Firestore) + backend + frontend
     npm run seed         (re)seed test users and notes into running emulators

   Everything talks to the emulators — nothing touches the real Firebase
   project. Emulator data is persisted in .emulator-data/ across restarts
   and seeded on the first run. Needs Java (for the emulators) and the
   Firebase CLI on PATH; frontend/ and backend/ must be npm-installed. */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESC, PORTS, ensurePortsFree, parseEnvFile, portOpen, waitForPort } from './lib/ports.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const seedOnly = process.argv.includes('--seed-only')

const EMULATOR_DATA = path.join(root, '.emulator-data')

const projectId = JSON.parse(readFileSync(path.join(root, '.firebaserc'), 'utf8')).projects.default

const colors = { emu: '33', api: '36', web: '32', seed: '35' }
function prefixed(name, stream) {
  let buf = ''
  stream.on('data', (chunk) => {
    buf += chunk.toString()
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ''
    for (const l of lines) process.stdout.write(`${ESC}[${colors[name]}m[${name}]${ESC}[0m ${l}\n`)
  })
}

let shuttingDown = false
const children = []
function run(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    cwd: opts.cwd ?? root,
    env: { ...process.env, FORCE_COLOR: '1', ...opts.env },
    shell: isWin, // resolve .cmd shims (firebase, npm, npx)
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  prefixed(name, child.stdout)
  prefixed(name, child.stderr)
  children.push({ name, child })
  if (opts.critical !== false) {
    child.on('exit', (code) => {
      if (shuttingDown) return
      console.error(`${ESC}[31m[${name}] exited with code ${code} — stopping the stack${ESC}[0m`)
      shuttingDown = true
      killAll()
      setTimeout(() => process.exit(code ?? 1), 500)
    })
  }
  return child
}

function killAll() {
  for (const { child } of children) {
    if (child.exitCode !== null) continue
    if (isWin) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGTERM')
  }
}

/* ── environment for the three processes ─────────────────────────────── */

const web = parseEnvFile(path.join(root, 'frontend', '.env.local'))
const backendDotenv = parseEnvFile(path.join(root, 'backend', '.env'))

const emulatorEnv = {
  GCLOUD_PROJECT: projectId,
  FIRESTORE_EMULATOR_HOST: `127.0.0.1:${PORTS.firestore}`,
  FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${PORTS.auth}`,
}

const backendEnv = {
  ...emulatorEnv,
  NODE_ENV: 'development',
  PORT: String(PORTS.backend),
  HOST: '127.0.0.1',
  PUBLIC_URL: `http://127.0.0.1:${PORTS.backend}`,
  FRONTEND_ORIGINS: `http://localhost:${PORTS.frontend},http://127.0.0.1:${PORTS.frontend}`,
  ANTHROPIC_API_KEY: backendDotenv.ANTHROPIC_API_KEY ?? '',
  // The OAuth consent page signs in with the Firebase web SDK; against the
  // Auth emulator any non-empty apiKey/appId works, but reuse the real ones.
  FIREBASE_WEB_API_KEY: web.VITE_FIREBASE_API_KEY ?? 'local',
  FIREBASE_WEB_AUTH_DOMAIN: web.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
  FIREBASE_WEB_PROJECT_ID: projectId,
  FIREBASE_WEB_APP_ID: web.VITE_FIREBASE_APP_ID ?? 'local',
  GOOGLE_APPLICATION_CREDENTIALS: '', // never use real credentials here
}

const frontendEnv = {
  VITE_FIREBASE_EMULATORS: '1',
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_API_KEY: web.VITE_FIREBASE_API_KEY ?? 'local',
  VITE_FIREBASE_APP_ID: web.VITE_FIREBASE_APP_ID ?? 'local',
  VITE_FIREBASE_AUTH_DOMAIN: web.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
  VITE_BACKEND_URL: `http://127.0.0.1:${PORTS.backend}`,
  VITE_MCP_URL: `http://127.0.0.1:${PORTS.backend}/mcp`,
}

/* ── main ─────────────────────────────────────────────────────────────── */

async function seed() {
  console.log(`${ESC}[35m[seed]${ESC}[0m seeding local users and notes…`)
  const child = run('seed', 'node', ['--import', 'tsx', 'scripts/seed-local.ts'], {
    cwd: path.join(root, 'backend'),
    env: emulatorEnv,
    critical: false,
  })
  await new Promise((resolve, reject) =>
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`seed exited with ${code}`)))),
  )
}

async function main() {
  if (seedOnly) {
    if (!(await portOpen(PORTS.firestore)) || !(await portOpen(PORTS.auth))) {
      console.error('Emulators are not running — start `npm run dev` first.')
      process.exit(1)
    }
    await seed()
    return
  }

  await ensurePortsFree(PORTS, 'dev')

  const firstRun = !existsSync(EMULATOR_DATA)
  run(
    'emu',
    'firebase',
    ['emulators:start', '--only', 'auth,firestore', '--project', projectId, '--import', EMULATOR_DATA, '--export-on-exit'],
  )
  await waitForPort(PORTS.firestore, 'Firestore emulator')
  await waitForPort(PORTS.auth, 'Auth emulator')

  if (firstRun) await seed()

  run('api', 'npm', ['run', 'dev'], { cwd: path.join(root, 'backend'), env: backendEnv })
  run('web', 'npx', ['vite', '--port', String(PORTS.frontend), '--strictPort'], {
    cwd: path.join(root, 'frontend'),
    env: frontendEnv,
  })
  await waitForPort(PORTS.backend, 'backend')
  await waitForPort(PORTS.frontend, 'frontend')

  console.log(`
${ESC}[1mLocal stack is up${ESC}[0m (project ${projectId}, emulators only — no real data touched)

  App          http://localhost:${PORTS.frontend}
  Backend      http://127.0.0.1:${PORTS.backend}   (MCP at /mcp)
  Emulator UI  http://127.0.0.1:${PORTS.emulatorUi}   (browse Firestore + Auth data)

  Sign in with Google (the emulator shows a fake account picker) or with the
  seeded accounts:  alice@local.test / bob@local.test   password: password123
  Alice owns "Family shopping", shared with Bob.

  MCP without OAuth — a long-lived local token for Alice is seeded:
    claude mcp add --transport http ench-local http://127.0.0.1:${PORTS.backend}/mcp \\
      --header "Authorization: Bearer enat_local_alice"

  Ctrl+C stops everything; emulator data is saved to .emulator-data/.
`)
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  // On Windows Ctrl+C reaches every process in the console, so the emulator
  // gets to export its data; give it a moment before forcing the rest.
  const timer = setTimeout(() => {
    killAll()
    process.exit(0)
  }, 15_000)
  Promise.all(children.map(({ child }) => (child.exitCode === null ? new Promise((r) => child.on('exit', r)) : null))).then(
    () => {
      clearTimeout(timer)
      process.exit(0)
    },
  )
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main().catch((err) => {
  console.error(err.message ?? err)
  killAll()
  process.exit(1)
})

// If any long-running child dies on its own, take the rest down with it.
process.on('exit', () => {
  if (!shuttingDown) killAll()
})
for (const evt of ['unhandledRejection']) process.on(evt, (e) => {
  console.error(e)
  killAll()
  process.exit(1)
})
