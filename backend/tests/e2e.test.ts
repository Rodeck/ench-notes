/* End-to-end test of the workspace layer and the MCP server over HTTP,
   against the Firestore + Auth emulators. Run from the repo root:
     npm run test:e2e
   It boots the real Fastify app on a spare port with a seeded bearer token,
   so no OAuth/HTTPS is involved. Uses its own project id so it never
   collides with `npm run dev` data. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('e2e: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must point at the emulators')
  process.exit(1)
}
process.env.GCLOUD_PROJECT = 'demo-ench-e2e'
const PORT = 8798
process.env.PORT = String(PORT)
process.env.HOST = '127.0.0.1'
process.env.PUBLIC_URL = `http://127.0.0.1:${PORT}`
process.env.GOOGLE_APPLICATION_CREDENTIALS = ''

const { auth, db } = await import('../src/firebase.js')
const ws = await import('../src/workspaces.js')
const notes = await import('../src/notes.js')
const { sha256 } = await import('../src/oauth/store.js')

let pass = 0, fail = 0
async function t(name: string, fn: () => Promise<void>) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FAIL', name, '\n       ', String((e as Error).message).split('\n')[0]) }
}
const expect = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg) }
async function expectError(fn: () => Promise<unknown>, code: string) {
  try { await fn() } catch (e) { expect((e as { code?: string }).code === code, `expected ${code}, got ${(e as Error).message}`); return }
  throw new Error(`expected error ${code}`)
}

// Start from a clean slate (emulator REST endpoints; test project only).
const fsHost = process.env.FIRESTORE_EMULATOR_HOST
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
await fetch(`http://${fsHost}/emulator/v1/projects/demo-ench-e2e/databases/(default)/documents`, { method: 'DELETE' })
await fetch(`http://${authHost}/emulator/v1/projects/demo-ench-e2e/accounts`, { method: 'DELETE' })

const a = await auth().createUser({ email: 'alice@x.com', displayName: 'Alice' })
const b = await auth().createUser({ email: 'bob@x.com', displayName: 'Bob' })
const c = await auth().createUser({ email: 'carol@x.com' })

console.log('workspaces module')
await t('ensureDefaultWorkspace creates once', async () => {
  const w1 = await ws.ensureDefaultWorkspace(a.uid)
  const w2 = await ws.ensureDefaultWorkspace(a.uid)
  expect(w1.id === a.uid && w2.id === a.uid, 'id should be uid')
  expect(w1.members[a.uid]?.displayName === 'Alice', 'owner member entry')
})
const sharedRef = await db().collection('workspaces').add({
  name: 'Team', ownerId: a.uid, memberIds: [a.uid],
  members: { [a.uid]: { role: 'owner', email: 'alice@x.com', displayName: 'Alice' } },
  createdAt: FieldValue.serverTimestamp(),
})
await t('owner shares by email', async () => {
  const r = await ws.addMemberByEmail(sharedRef.id, a.uid, 'Bob@X.com ')
  expect(r.uid === b.uid && r.member.displayName === 'Bob', 'resolved bob')
  const w = await ws.getWorkspace(sharedRef.id)
  expect(w.memberIds.includes(b.uid) && w.members[b.uid].role === 'member', 'bob is member')
})
await t('sharing twice -> already_member', () => expectError(() => ws.addMemberByEmail(sharedRef.id, a.uid, 'bob@x.com'), 'already_member'))
await t('unknown email -> user_not_found', () => expectError(() => ws.addMemberByEmail(sharedRef.id, a.uid, 'nobody@x.com'), 'user_not_found'))
await t('member cannot share', () => expectError(() => ws.addMemberByEmail(sharedRef.id, b.uid, 'carol@x.com'), 'not_owner'))
await t('outsider cannot share', () => expectError(() => ws.addMemberByEmail(sharedRef.id, c.uid, 'carol@x.com'), 'not_a_member'))
await t('listWorkspacesFor bob: default first + Team', async () => {
  const list = await ws.listWorkspacesFor(b.uid)
  expect(list.length === 2 && list[0].id === b.uid && list[1].name === 'Team', JSON.stringify(list.map((w: any) => w.name)))
})
await t('member cannot remove another member', async () => {
  await ws.addMemberByEmail(sharedRef.id, a.uid, 'carol@x.com')
  await expectError(() => ws.removeMember(sharedRef.id, b.uid, c.uid), 'not_owner')
})
await t('owner cannot be removed', () => expectError(() => ws.removeMember(sharedRef.id, b.uid, a.uid), 'cannot_remove_owner'))
await t('member leaves', async () => {
  await ws.removeMember(sharedRef.id, c.uid, c.uid)
  const w = await ws.getWorkspace(sharedRef.id)
  expect(!w.memberIds.includes(c.uid) && !(c.uid in w.members), 'carol gone')
})
await t('default workspace cannot be deleted', () => expectError(() => ws.deleteWorkspace(a.uid, a.uid), 'cannot_delete_default'))
await t('member cannot delete', () => expectError(() => ws.deleteWorkspace(sharedRef.id, b.uid), 'not_owner'))

console.log('notes module in shared workspace')
await t('create + search + update + delete', async () => {
  const n = await notes.createNote(sharedRef.id, 'TestClient', { title: 'Grocery list', body: 'milk', subjectName: 'Home', tags: ['#Food'] })
  expect(n.tags[0] === 'food', 'tag normalized')
  const subj = await notes.listSubjects(sharedRef.id)
  expect(subj.length === 1 && subj[0].name === 'Home', 'subject created')
  const found = await notes.searchNotes(sharedRef.id, 'MILK')
  expect(found.length === 1, 'search hit')
  await notes.updateNote(sharedRef.id, 'TestClient', n.id, { body: 'milk, eggs' })
  expect((await notes.getNote(sharedRef.id, n.id)).body === 'milk, eggs', 'updated')
})

console.log('MCP over HTTP')
// Seed a bearer token for Bob (write scope) and his mcpClients connection.
const token = 'enat_test_bob'
await db().collection('oauthTokens').doc(sha256(token)).set({
  type: 'access', uid: b.uid, clientId: 'client_test', scope: 'read write',
  expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
})
await db().collection('users').doc(b.uid).collection('mcpClients').doc('client_test').set({ name: 'Claude Test', scopes: ['read', 'write'] })

await import('../src/index.js')
await new Promise((r) => setTimeout(r, 800))

const client = new Client({ name: 'e2e', version: '0' })
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
}))
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args })
  return JSON.parse((res.content as { text: string }[])[0].text)
}

await t('tools list includes list_workspaces + writes', async () => {
  const names = (await client.listTools()).tools.map((x) => x.name)
  for (const n of ['list_workspaces', 'search_notes', 'get_note', 'list_subjects', 'create_note', 'update_note', 'delete_note']) expect(names.includes(n), `missing ${n}`)
})
await t('list_workspaces: bob sees default + Team', async () => {
  const list = await call('list_workspaces')
  expect(list.length === 2 && list[0].is_default && list[1].name === 'Team' && list[1].role === 'member' && list[1].shared, JSON.stringify(list))
})
await t('search across workspaces finds Team note tagged with workspace', async () => {
  const r = await call('search_notes', { query: 'grocery' })
  expect(r.length === 1 && r[0].workspace === 'Team', JSON.stringify(r))
})
let bobNoteId = ''
await t('create_note without workspace -> default', async () => {
  const n = await call('create_note', { title: 'Private', body: 'mine' })
  expect(n.workspace_id === b.uid, JSON.stringify(n))
  bobNoteId = n.id
})
await t('create_note in Team by name', async () => {
  const n = await call('create_note', { title: 'From Bob', body: 'hi', workspace: 'team', subject: 'Home' })
  expect(n.workspace_id === sharedRef.id && n.subject === 'Home', JSON.stringify(n))
})
await t('create_note in unknown workspace -> error', async () => {
  const r = await call('create_note', { title: 'x', body: 'y', workspace: 'Nope' })
  expect(r.error === 'workspace_not_found', JSON.stringify(r))
})
await t('list_subjects scoped to Team', async () => {
  const r = await call('list_subjects', { workspace: sharedRef.id })
  expect(r.length === 1 && r[0].subjects.length === 1, JSON.stringify(r))
})
await t('get_note locates note across workspaces', async () => {
  const r = await call('get_note', { note_id: bobNoteId })
  expect(r.title === 'Private', JSON.stringify(r))
})
await t('update_note in shared workspace by id only', async () => {
  const hit = (await call('search_notes', { query: 'From Bob' }))[0]
  const r = await call('update_note', { note_id: hit.id, tags: ['Shared'] })
  expect(r.tags[0] === 'shared' && r.workspace === 'Team', JSON.stringify(r))
})
await t('search with empty query lists recent from all', async () => {
  const r = await call('search_notes', { query: '' })
  expect(r.length === 3, `got ${r.length}`)
})

// Alice removes Bob: his token must no longer reach Team.
await ws.removeMember(sharedRef.id, a.uid, b.uid)
await t('after removal: Team invisible', async () => {
  const list = await call('list_workspaces')
  expect(list.length === 1, JSON.stringify(list))
  const r = await call('search_notes', { query: 'grocery' })
  expect(r.length === 0, 'should not find Team notes')
  const byId = await call('get_note', { note_id: (await notes.listNotes(sharedRef.id))[0].id })
  expect(byId.error === 'note_not_found', JSON.stringify(byId))
  const byWs = await call('search_notes', { query: '', workspace: sharedRef.id })
  expect(byWs.error === 'workspace_not_found', JSON.stringify(byWs))
  const del = await call('delete_note', { note_id: (await notes.listNotes(sharedRef.id))[0].id, workspace: 'Team' })
  expect(del.error === 'note_not_found', JSON.stringify(del))
})
await t('delete own note', async () => {
  const r = await call('delete_note', { note_id: bobNoteId })
  expect(r.deleted === bobNoteId, JSON.stringify(r))
})
await t('owner deletes Team recursively', async () => {
  await ws.deleteWorkspace(sharedRef.id, a.uid)
  expect(!(await ws.getWorkspace(sharedRef.id)), 'gone')
  expect((await sharedRef.collection('notes').get()).empty, 'notes gone')
})

await client.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
