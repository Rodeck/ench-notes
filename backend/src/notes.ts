import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from './firebase.js'

/** Firestore note operations shared by the MCP tools. Mirrors the frontend's
    data contract under users/{uid}. Writes stamp origin: 'mcp' + client name,
    which powers the MCP badge in the app. */

export interface NoteDoc {
  id: string
  title: string
  body: string
  subjectId: string | null
  tags: string[]
  createdAt?: Timestamp
  updatedAt?: Timestamp
  origin?: string
  originClient?: string
}

export interface SubjectDoc {
  id: string
  name: string
  color: string
}

const notesCol = (uid: string) => db().collection('users').doc(uid).collection('notes')
const subjectsCol = (uid: string) => db().collection('users').doc(uid).collection('subjects')

export async function listSubjects(uid: string): Promise<SubjectDoc[]> {
  const snap = await subjectsCol(uid).get()
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SubjectDoc, 'id'>) }))
}

export async function listNotes(uid: string, limit = 200): Promise<NoteDoc[]> {
  const snap = await notesCol(uid).orderBy('updatedAt', 'desc').limit(limit).get()
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NoteDoc, 'id'>) }))
}

export async function getNote(uid: string, noteId: string): Promise<NoteDoc | null> {
  const doc = await notesCol(uid).doc(noteId).get()
  if (!doc.exists) return null
  return { id: doc.id, ...(doc.data() as Omit<NoteDoc, 'id'>) }
}

/** Substring search over title/body/tags. Firestore has no FTS; the corpus is
    one user's notes, so an in-memory scan over the recent set is adequate. */
export async function searchNotes(uid: string, query: string, limit = 20): Promise<NoteDoc[]> {
  const all = await listNotes(uid, 500)
  const needle = query.toLowerCase()
  return all
    .filter(
      (n) =>
        n.title?.toLowerCase().includes(needle) ||
        n.body?.toLowerCase().includes(needle) ||
        n.tags?.some((t) => t.toLowerCase().includes(needle)),
    )
    .slice(0, limit)
}

export async function createNote(
  uid: string,
  client: string,
  data: { title: string; body: string; subjectName?: string; tags?: string[] },
): Promise<NoteDoc> {
  const subjectId = data.subjectName ? await resolveSubject(uid, data.subjectName) : null
  const ref = await notesCol(uid).add({
    title: data.title,
    body: data.body,
    subjectId,
    tags: (data.tags ?? []).map(normalizeTag),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    origin: 'mcp',
    originClient: client,
  })
  return (await getNote(uid, ref.id))!
}

export async function updateNote(
  uid: string,
  client: string,
  noteId: string,
  patch: { title?: string; body?: string; subjectName?: string; tags?: string[] },
): Promise<NoteDoc | null> {
  const existing = await getNote(uid, noteId)
  if (!existing) return null
  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    origin: 'mcp',
    originClient: client,
  }
  if (patch.title !== undefined) update.title = patch.title
  if (patch.body !== undefined) update.body = patch.body
  if (patch.tags !== undefined) update.tags = patch.tags.map(normalizeTag)
  if (patch.subjectName !== undefined) {
    update.subjectId = patch.subjectName ? await resolveSubject(uid, patch.subjectName) : null
  }
  await notesCol(uid).doc(noteId).update(update)
  return getNote(uid, noteId)
}

export async function deleteNote(uid: string, noteId: string): Promise<boolean> {
  const existing = await getNote(uid, noteId)
  if (!existing) return false
  await notesCol(uid).doc(noteId).delete()
  return true
}

function normalizeTag(t: string): string {
  return t.trim().replace(/^#/, '').toLowerCase()
}

/** Find a subject by name (case-insensitive); create it if missing. */
async function resolveSubject(uid: string, name: string): Promise<string> {
  const subjects = await listSubjects(uid)
  const found = subjects.find((s) => s.name.toLowerCase() === name.trim().toLowerCase())
  if (found) return found.id
  const colors = ['#c67139', '#7a8a5e', '#8a6fa8', '#5d7f8f', '#a13b2a', '#7a5714', '#31505e', '#6b503a']
  const ref = await subjectsCol(uid).add({
    name: name.trim(),
    color: colors[subjects.length % colors.length],
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

/** Serialize a note for LLM consumption. */
export function noteForLlm(n: NoteDoc, subjects: SubjectDoc[]) {
  const subject = subjects.find((s) => s.id === n.subjectId)
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    subject: subject?.name ?? null,
    tags: n.tags ?? [],
    createdAt: n.createdAt?.toDate().toISOString() ?? null,
    updatedAt: n.updatedAt?.toDate().toISOString() ?? null,
  }
}
