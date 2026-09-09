import { FieldValue } from 'firebase-admin/firestore'
import { auth, db } from '../src/firebase.js'
import { DEFAULT_WORKSPACE_NAME } from '../src/workspaces.js'

/* One-off migration: copy every user's notes and subjects from the legacy
   users/{uid}/{notes,subjects} location into their default workspace
   workspaces/{uid}/{notes,subjects}, creating the workspace doc if needed.

   Idempotent and non-destructive: existing target docs are left untouched
   and the legacy docs stay in place (delete them by hand once verified).

   Run with GOOGLE_APPLICATION_CREDENTIALS pointing at the service account:
     npm run migrate:workspaces           # dry run (prints what would change)
     npm run migrate:workspaces -- --apply */

const apply = process.argv.includes('--apply')
const log = (...a: unknown[]) => console.log(...a)

async function copyCollection(from: FirebaseFirestore.CollectionReference, to: FirebaseFirestore.CollectionReference) {
  const src = await from.get()
  const existing = new Set((await to.select().get()).docs.map((d) => d.id))
  let copied = 0
  let batch = db().batch()
  let inBatch = 0
  for (const doc of src.docs) {
    if (existing.has(doc.id)) continue
    copied++
    if (!apply) continue
    batch.set(to.doc(doc.id), doc.data())
    if (++inBatch === 400) {
      await batch.commit()
      batch = db().batch()
      inBatch = 0
    }
  }
  if (apply && inBatch > 0) await batch.commit()
  return { total: src.size, copied, skipped: src.size - copied }
}

async function migrateUser(uid: string, profile: FirebaseFirestore.DocumentData) {
  const wsRef = db().collection('workspaces').doc(uid)
  const ws = await wsRef.get()
  if (!ws.exists) {
    const user = await auth().getUser(uid).catch(() => null)
    const email = user?.email ?? profile.email ?? ''
    const displayName = user?.displayName || profile.displayName || email.split('@')[0] || 'Someone'
    log(`  create workspace "${DEFAULT_WORKSPACE_NAME}" for ${email || uid}`)
    if (apply) {
      await wsRef.create({
        name: DEFAULT_WORKSPACE_NAME,
        ownerId: uid,
        memberIds: [uid],
        members: { [uid]: { role: 'owner', email, displayName, addedAt: FieldValue.serverTimestamp() } },
        createdAt: FieldValue.serverTimestamp(),
      })
    }
  }
  const userRef = db().collection('users').doc(uid)
  const notes = await copyCollection(userRef.collection('notes'), wsRef.collection('notes'))
  const subjects = await copyCollection(userRef.collection('subjects'), wsRef.collection('subjects'))
  log(`  notes: ${notes.copied} copied, ${notes.skipped} already present; subjects: ${subjects.copied} copied, ${subjects.skipped} already present`)
  if (apply && profile.defaultWorkspaceId !== uid) await userRef.set({ defaultWorkspaceId: uid }, { merge: true })
}

const users = await db().collection('users').get()
log(`${apply ? 'Migrating' : 'Dry run over'} ${users.size} user(s)`)
for (const u of users.docs) {
  log(`- ${u.id}`)
  await migrateUser(u.id, u.data())
}
log(apply ? 'Done.' : 'Dry run complete — re-run with --apply to write.')
