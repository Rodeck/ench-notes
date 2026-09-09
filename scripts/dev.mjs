#!/usr/bin/env node
/* One-command local stack:
     npm run dev          emulators (Auth + Firestore) + backend + frontend
     npm run seed         (re)seed test users and notes into running emulators

   Everything talks to the emulators — nothing touches the real Firebase
   project. Emulator data is persisted in .emulator-data/ across restarts
   and seeded on the first run. Needs Java (for the emulators) and the
   Firebase CLI on PATH; frontend/ and backend/ must be npm-installed. */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const seedOnly = process.argv.includes('--seed-only')

const ESC = String.fromCharCode(27) // terminal color escapes
const PORTS = { firestore: 8080, auth: 9099, emulatorUi: 4000, backend: 8787, frontend: 5173 }
const EMULATOR_DATA = path.join(root, '.emulator-data')

const projectId = JSON.parse(readFileSync(path.join(root, '.firebaserc'), 'utf8')).projects.default

/* ── helpers ─────────────────────────────────────────────────────────── */

function parseEnvFile(file) {
  if (!existsSync(file)) return {}
  const out = {}
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => resolve(false))
    s.once('listening', () => s.close(() => resolve(true)))
    s.listen(port, '127.0.0.1')
  })
}

function portOpenOn(port, host) {
  return new Promise((resolve) => {
    const c = net.connect(port, host)
    c.once('connect', () => c.end(() => resolve(true)))
    c.once('error', () => resolve(false))
  })
}

// Vite binds "localhost", which Node may resolve to ::1 — check both.
async function portOpen(port) {
  return (await portOpenOn(port, '127.0.0.1')) || (await portOpenOn(port, '::1'))
}

async function waitForPort(port, label, timeoutMs = 90_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(port)) return
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`${label} did not open port ${port} within ${timeoutMs / 1000}s`)
}

/* ── port cleanup ─────────────────────────────────────────────────────── */

/** Listening processes on a port: [{ pid, name }]. Best effort, never throws. */
function listenersOn(port) {
  try {
    if (isWin) {
      const out = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true })
      const pids = new Set()
      for (const line of out.split(/\r?\n/)) {
        const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/)
        if (m && Number(m[1]) === port) pids.add(Number(m[2]))
      }
      return [...pids].map((pid) => {
        const csv = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
        const name = (csv.match(/^"([^"]+)"/) ?? [])[1] ?? ''
        return { pid, name: name.replace(/\.exe$/i, '').toLowerCase() }
      })
    }
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
    return out
      .split(/\s+/)
      .filter(Boolean)
      .map((pid) => {
        let name = ''
        try {
          name = execFileSync('ps', ['-p', pid, '-o', 'comm='], { encoding: 'utf8' }).trim().toLowerCase()
        } catch {}
        return { pid: Number(pid), name: name.split('/').pop() ?? name }
      })
  } catch {
    return []
  }
}

/** Kill leftovers from a previous run on our ports. Only Java (the
    emulators) and Node (backend, Vite) are touched; anything else is left
    alone and reported so the user can decide. */
async function freePorts() {
  const stuck = []
  for (const [name, port] of Object.entries(PORTS)) {
    if (await portFree(port)) continue
    for (const proc of listenersOn(port)) {
      if (proc.name === 'java' || proc.name === 'node') {
        console.log(`${ESC}[33m[dev]${ESC}[0m freeing port ${port} (${name}): stopping leftover ${proc.name} (pid ${proc.pid})`)
        try {
          if (isWin) execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
          else process.kill(proc.pid, 'SIGKILL')
        } catch {}
      } else {
        stuck.push(`${name} (${port}) held by ${proc.name || 'an unknown process'} pid ${proc.pid}`)
      }
    }
  }
  // Give the OS a moment to release the sockets.
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const busy = []
    for (const port of Object.values(PORTS)) if (!(await portFree(port))) busy.push(port)
    if (busy.length === 0) break
    await new Promise((r) => setTimeout(r, 300))
  }
  return stuck
}

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

  const stuck = await freePorts()
  const busy = []
  for (const [name, port] of Object.entries(PORTS)) if (!(await portFree(port))) busy.push(`${name} (${port})`)
  if (busy.length) {
    console.error(`Ports still in use: ${busy.join(', ')}.`)
    for (const s of stuck) console.error(`  ${s}`)
    console.error('Stop whatever holds them and run `npm run dev` again.')
    process.exit(1)
  }

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
