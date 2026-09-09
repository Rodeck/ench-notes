/* Port and process helpers shared by the dev stack (dev.mjs) and the test
   runner (test.mjs). */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'

const isWin = process.platform === 'win32'

export const ESC = String.fromCharCode(27) // terminal color escapes

/** Every port the local stack listens on. */
export const PORTS = { firestore: 8080, auth: 9099, emulatorUi: 4000, emulatorHub: 4400, backend: 8787, frontend: 5173 }

/** Ports the emulators alone need (for `npm test`). */
export const EMULATOR_PORTS = { firestore: PORTS.firestore, auth: PORTS.auth, emulatorHub: PORTS.emulatorHub }

export function parseEnvFile(file) {
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

export function portFree(port) {
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
export async function portOpen(port) {
  return (await portOpenOn(port, '127.0.0.1')) || (await portOpenOn(port, '::1'))
}

export async function waitForPort(port, label, timeoutMs = 90_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(port)) return
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`${label} did not open port ${port} within ${timeoutMs / 1000}s`)
}

/** Listening processes on a port: [{ pid, name }]. Best effort, never throws. */
export function listenersOn(port) {
  try {
    if (isWin) {
      const out = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true })
      const pids = new Set()
      for (const line of out.split(/\r?\n/)) {
        const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/)
        if (m && Number(m[1]) === port) pids.add(Number(m[2]))
      }
      return [...pids].map((pid) => {
        const csv = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
          encoding: 'utf8',
          windowsHide: true,
        })
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

/** Kill leftovers from a previous run on the given ports. Only Java (the
    emulators) and Node (backend, Vite) are touched; anything else is left
    alone and returned so the caller can report it. */
export async function freePorts(ports = PORTS, tag = 'dev') {
  const stuck = []
  for (const [name, port] of Object.entries(ports)) {
    if (await portFree(port)) continue
    for (const proc of listenersOn(port)) {
      if (proc.name === 'java' || proc.name === 'node') {
        console.log(`${ESC}[33m[${tag}]${ESC}[0m freeing port ${port} (${name}): stopping leftover ${proc.name} (pid ${proc.pid})`)
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
    let busy = false
    for (const port of Object.values(ports)) if (!(await portFree(port))) busy = true
    if (!busy) break
    await new Promise((r) => setTimeout(r, 300))
  }
  return stuck
}

/** freePorts + a clear failure when something else still holds a port. */
export async function ensurePortsFree(ports = PORTS, tag = 'dev') {
  const stuck = await freePorts(ports, tag)
  const busy = []
  for (const [name, port] of Object.entries(ports)) if (!(await portFree(port))) busy.push(`${name} (${port})`)
  if (busy.length) {
    console.error(`Ports still in use: ${busy.join(', ')}.`)
    for (const s of stuck) console.error(`  ${s}`)
    console.error('Stop whatever holds them and try again.')
    process.exit(1)
  }
}
