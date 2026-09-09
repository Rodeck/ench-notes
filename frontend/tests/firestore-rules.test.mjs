import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore'

/* Firestore security rules tests. Run from the repo root:
     npm run test:rules      (starts the Firestore emulator, runs this, stops it)
   or under an already running `npm run dev` stack:
     node frontend/tests/firestore-rules.test.mjs */

const rulesPath = fileURLToPath(new URL('../../firestore.rules', import.meta.url))
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
const env = await initializeTestEnvironment({
  projectId: 'demo-ench-rules',
  firestore: { rules: readFileSync(rulesPath, 'utf8'), host, port: Number(port) },
})

const A = 'userA', B = 'userB', C = 'userC'
const dbAs = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.com` }).firestore()
const ws = (id) => ({
  name: 'Shared', ownerId: A, memberIds: [A, B],
  members: { [A]: { role: 'owner', email: 'a@x.com', displayName: 'A' }, [B]: { role: 'member', email: 'b@x.com', displayName: 'B' } },
  createdAt: serverTimestamp(),
})

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FAIL', name, '\n       ', String(e.message).split('\n')[0]) }
}

await env.clearFirestore()
// Seed with admin: workspace "shared" (A owner, B member), note inside; A's default ws.
await env.withSecurityRulesDisabled(async (ctx) => {
  const admin = ctx.firestore()
  await setDoc(doc(admin, 'workspaces', 'shared'), ws())
  await setDoc(doc(admin, 'workspaces', 'shared', 'notes', 'n1'), { title: 't', body: 'b', subjectId: null, tags: [], origin: 'user' })
  await setDoc(doc(admin, 'workspaces', 'shared', 'subjects', 's1'), { name: 'S', color: '#000' })
  await setDoc(doc(admin, 'users', A), { premium: false, displayName: 'A', email: 'a@x.com' })
  await setDoc(doc(admin, 'users', A, 'notes', 'legacy'), { title: 'old' })
})

console.log('workspace doc access')
await t('owner reads workspace', () => assertSucceeds(getDoc(doc(dbAs(A), 'workspaces', 'shared'))))
await t('member reads workspace', () => assertSucceeds(getDoc(doc(dbAs(B), 'workspaces', 'shared'))))
await t('outsider cannot read workspace', () => assertFails(getDoc(doc(dbAs(C), 'workspaces', 'shared'))))
await t('unauthenticated cannot read workspace', () => assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'workspaces', 'shared'))))

console.log('membership list query')
await t('member lists own workspaces via array-contains', async () => {
  const snap = await assertSucceeds(getDocs(query(collection(dbAs(B), 'workspaces'), where('memberIds', 'array-contains', B))))
  if (snap.size !== 1) throw new Error(`expected 1 got ${snap.size}`)
})
await t('cannot list workspaces without membership filter', () => assertFails(getDocs(collection(dbAs(B), 'workspaces'))))
await t('cannot query for someone else\'s memberships', () => assertFails(getDocs(query(collection(dbAs(C), 'workspaces'), where('memberIds', 'array-contains', A)))))

console.log('workspace create')
await t('user creates default workspace (id = uid)', () =>
  assertSucceeds(setDoc(doc(dbAs(C), 'workspaces', C), { name: 'My notes', ownerId: C, memberIds: [C], members: { [C]: { role: 'owner', email: 'c@x.com', displayName: 'C' } }, createdAt: serverTimestamp() })))
await t('user creates extra workspace', () =>
  assertSucceeds(addDoc(collection(dbAs(C), 'workspaces'), { name: 'Extra', ownerId: C, memberIds: [C], members: { [C]: { role: 'owner', email: 'c@x.com', displayName: 'C' } }, createdAt: serverTimestamp() })))
await t('cannot create workspace with other members', () =>
  assertFails(addDoc(collection(dbAs(C), 'workspaces'), { name: 'Sneaky', ownerId: C, memberIds: [C, A], members: { [C]: { role: 'owner', email: '', displayName: 'C' } }, createdAt: serverTimestamp() })))
await t('cannot create workspace with members map for others', () =>
  assertFails(addDoc(collection(dbAs(C), 'workspaces'), { name: 'Sneaky', ownerId: C, memberIds: [C], members: { [C]: { role: 'owner' }, [A]: { role: 'member' } }, createdAt: serverTimestamp() })))
await t('cannot create workspace owned by someone else', () =>
  assertFails(addDoc(collection(dbAs(C), 'workspaces'), { name: 'Sneaky', ownerId: A, memberIds: [A], members: { [A]: { role: 'owner' } }, createdAt: serverTimestamp() })))
await t('cannot create workspace with empty name', () =>
  assertFails(addDoc(collection(dbAs(C), 'workspaces'), { name: '', ownerId: C, memberIds: [C], members: { [C]: { role: 'owner' } }, createdAt: serverTimestamp() })))

console.log('workspace update / delete')
await t('owner renames', () => assertSucceeds(updateDoc(doc(dbAs(A), 'workspaces', 'shared'), { name: 'Renamed', updatedAt: serverTimestamp() })))
await t('member cannot rename', () => assertFails(updateDoc(doc(dbAs(B), 'workspaces', 'shared'), { name: 'Nope' })))
await t('owner cannot add member client-side', () => assertFails(updateDoc(doc(dbAs(A), 'workspaces', 'shared'), { memberIds: [A, B, C] })))
await t('owner cannot edit members map client-side', () => assertFails(updateDoc(doc(dbAs(A), 'workspaces', 'shared'), { 'members.userC': { role: 'member' } })))
await t('owner cannot transfer ownership client-side', () => assertFails(updateDoc(doc(dbAs(A), 'workspaces', 'shared'), { ownerId: B })))
await t('owner cannot delete client-side', () => assertFails(deleteDoc(doc(dbAs(A), 'workspaces', 'shared'))))

console.log('notes & subjects')
await t('member reads notes list', async () => {
  const snap = await assertSucceeds(getDocs(collection(dbAs(B), 'workspaces', 'shared', 'notes')))
  if (snap.size !== 1) throw new Error(`expected 1 got ${snap.size}`)
})
await t('member edits note', () => assertSucceeds(updateDoc(doc(dbAs(B), 'workspaces', 'shared', 'notes', 'n1'), { title: 'by B' })))
await t('member creates note', () => assertSucceeds(addDoc(collection(dbAs(B), 'workspaces', 'shared', 'notes'), { title: '', body: '', tags: [], subjectId: null })))
await t('member deletes note', () => assertSucceeds(deleteDoc(doc(dbAs(B), 'workspaces', 'shared', 'notes', 'n1'))))
await t('member creates subject', () => assertSucceeds(addDoc(collection(dbAs(B), 'workspaces', 'shared', 'subjects'), { name: 'X', color: '#111' })))
await t('outsider cannot read notes', () => assertFails(getDocs(collection(dbAs(C), 'workspaces', 'shared', 'notes'))))
await t('outsider cannot create note', () => assertFails(addDoc(collection(dbAs(C), 'workspaces', 'shared', 'notes'), { title: 'x' })))
await t('outsider cannot read subjects', () => assertFails(getDocs(collection(dbAs(C), 'workspaces', 'shared', 'subjects'))))
await t('notes in nonexistent workspace denied', () => assertFails(getDocs(collection(dbAs(C), 'workspaces', 'nope', 'notes'))))

console.log('after removal (admin removes B)')
await env.withSecurityRulesDisabled(async (ctx) => {
  await updateDoc(doc(ctx.firestore(), 'workspaces', 'shared'), { memberIds: [A] })
})
await t('removed member cannot read notes', () => assertFails(getDocs(collection(dbAs(B), 'workspaces', 'shared', 'notes'))))
await t('removed member cannot read workspace', () => assertFails(getDoc(doc(dbAs(B), 'workspaces', 'shared'))))

console.log('legacy users/{uid}/notes')
await t('owner can still read legacy notes', () => assertSucceeds(getDoc(doc(dbAs(A), 'users', A, 'notes', 'legacy'))))
await t('owner cannot write legacy notes', () => assertFails(updateDoc(doc(dbAs(A), 'users', A, 'notes', 'legacy'), { title: 'x' })))
await t('user profile: can set defaultWorkspaceId', () => assertSucceeds(updateDoc(doc(dbAs(A), 'users', A), { defaultWorkspaceId: A })))
await t('user profile: cannot flip premium', () => assertFails(updateDoc(doc(dbAs(A), 'users', A), { premium: true })))

await env.cleanup()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
