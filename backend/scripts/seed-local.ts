import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { auth, db } from '../src/firebase.js'
import { sha256 } from '../src/oauth/store.js'
import { DEFAULT_WORKSPACE_NAME } from '../src/workspaces.js'

/* Seed the local emulators with two users, their default workspaces, a
   shared workspace, a few notes, and a long-lived MCP bearer token for
   Alice. Idempotent (fixed ids). Refuses to run against real Firebase. */

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('seed-local: refusing to run without FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST')
  process.exit(1)
}

export const SEED = {
  password: 'password123',
  alice: { uid: 'alice-local', email: 'alice@local.test', displayName: 'Alice Local' },
  bob: { uid: 'bob-local', email: 'bob@local.test', displayName: 'Bob Local' },
  sharedWorkspaceId: 'family-shopping-local',
  mcpToken: 'enat_local_alice',
  mcpClientId: 'client_local_dev',
}

const now = () => FieldValue.serverTimestamp()

async function ensureUser(u: { uid: string; email: string; displayName: string }) {
  await auth()
    .createUser({ uid: u.uid, email: u.email, password: SEED.password, displayName: u.displayName, emailVerified: true })
    .catch((err: { code?: string }) => {
      if (err.code !== 'auth/uid-already-exists' && err.code !== 'auth/email-already-exists') throw err
    })
  await db().collection('users').doc(u.uid).set(
    { displayName: u.displayName, email: u.email, premium: false, theme: 'system', defaultWorkspaceId: u.uid },
    { merge: true },
  )
  await db()
    .collection('workspaces')
    .doc(u.uid)
    .set(
      {
        name: DEFAULT_WORKSPACE_NAME,
        ownerId: u.uid,
        memberIds: [u.uid],
        members: { [u.uid]: { role: 'owner', email: u.email, displayName: u.displayName, addedAt: now() } },
        createdAt: now(),
      },
      { merge: true },
    )
}

async function subject(wsId: string, id: string, name: string, color: string) {
  await db().collection('workspaces').doc(wsId).collection('subjects').doc(id).set({ name, color, createdAt: now() })
  return id
}

async function note(
  wsId: string,
  id: string,
  data: { title: string; body: string; subjectId: string | null; tags: string[]; by: string },
) {
  await db()
    .collection('workspaces')
    .doc(wsId)
    .collection('notes')
    .doc(id)
    .set({
      title: data.title,
      body: data.body,
      subjectId: data.subjectId,
      tags: data.tags,
      createdAt: now(),
      updatedAt: now(),
      origin: 'user',
      updatedByName: data.by,
    })
}

const { alice, bob } = SEED
await ensureUser(alice)
await ensureUser(bob)

// Alice's personal notes
const projects = await subject(alice.uid, 'projects', 'Projects', '#c67139')
const life = await subject(alice.uid, 'lifestyle', 'Lifestyle', '#7a8a5e')
await note(alice.uid, 'ench-notes-plan', {
  title: 'ench notes — next steps',
  body: '## Decisions\n\n- Workspaces are the unit of sharing\n- MCP tools take an optional `workspace`\n\n## Open\n\n- Pending invites for people without an account',
  subjectId: projects,
  tags: ['decision', 'spec'],
  by: alice.displayName,
})
await note(alice.uid, 'running-plan', {
  title: 'Running plan',
  body: 'Three runs a week, long run on Sunday. Target: 10k under 55 min by November.',
  subjectId: life,
  tags: ['idea'],
  by: alice.displayName,
})

// Bob's personal note
await note(bob.uid, 'bob-private', {
  title: 'Bob’s private note',
  body: 'Only Bob can see this one.',
  subjectId: null,
  tags: [],
  by: bob.displayName,
})

// Shared workspace: Alice owns, Bob is a member
const ws = SEED.sharedWorkspaceId
await db()
  .collection('workspaces')
  .doc(ws)
  .set(
    {
      name: 'Family shopping',
      ownerId: alice.uid,
      memberIds: [alice.uid, bob.uid],
      members: {
        [alice.uid]: { role: 'owner', email: alice.email, displayName: alice.displayName, addedAt: now() },
        [bob.uid]: { role: 'member', email: bob.email, displayName: bob.displayName, addedAt: now() },
      },
      createdAt: now(),
    },
    { merge: true },
  )
const groceries = await subject(ws, 'groceries', 'Groceries', '#5d7f8f')
await note(ws, 'saturday', {
  title: 'Groceries for Saturday',
  body: '- milk\n- eggs\n- bread\n- coffee beans',
  subjectId: groceries,
  tags: ['weekly'],
  by: alice.displayName,
})
await note(ws, 'birthday', {
  title: 'Birthday dinner ideas',
  body: 'Bob suggests the Thai place; Alice votes for cooking at home.',
  subjectId: null,
  tags: ['idea'],
  by: bob.displayName,
})

// A shared todo list in Family shopping
const listRef = db().collection('workspaces').doc(ws).collection('todoLists').doc('weekend-list')
await listRef.set({ name: 'Weekend', createdAt: now(), createdBy: alice.uid, createdByName: alice.displayName }, { merge: true })
const todayIso = new Date().toISOString().slice(0, 10)
const seedItems: Array<[string, Record<string, unknown>]> = [
  ['buy-flowers', { title: 'Buy flowers for grandma', done: false, assigneeId: bob.uid, assigneeName: bob.displayName, dueDate: todayIso, addedBy: alice.uid, addedByName: alice.displayName }],
  ['book-table', { title: 'Book a table for Saturday', done: false, assigneeId: alice.uid, assigneeName: alice.displayName, dueDate: null, addedBy: bob.uid, addedByName: bob.displayName }],
  ['return-library', { title: 'Return library books', done: true, assigneeId: null, assigneeName: null, dueDate: null, addedBy: alice.uid, addedByName: alice.displayName }],
]
for (const [id, data] of seedItems) {
  await listRef.collection('items').doc(id).set(
    { ...data, doneAt: data.done ? now() : null, createdAt: now(), updatedAt: now(), origin: 'user' },
    { merge: true },
  )
}

// A static MCP bearer token for Alice (read + write), valid for a year, so
// local MCP clients can skip OAuth. Only meaningful against the emulator.
await db()
  .collection('oauthTokens')
  .doc(sha256(SEED.mcpToken))
  .set({
    type: 'access',
    uid: alice.uid,
    clientId: SEED.mcpClientId,
    scope: 'read write',
    expiresAt: Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000),
  })
await db()
  .collection('users')
  .doc(alice.uid)
  .collection('mcpClients')
  .doc(SEED.mcpClientId)
  .set({ name: 'Local dev client', scopes: ['read', 'write'], connectedAt: now(), lastUsedAt: null }, { merge: true })

console.log(
  `seeded ${alice.email} and ${bob.email} (password ${SEED.password}), shared workspace "Family shopping" (+ todo list "Weekend"), MCP token ${SEED.mcpToken}`,
)
