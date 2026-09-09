import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from './firebase.js'

/** Firestore note operations shared by the MCP tools. Mirrors the frontend's
    data contract under workspaces/{wsId}. Callers must have verified the user
    is a member of the workspace (see workspaces.ts). Writes stamp
    origin: 'mcp' + client name, which powers the MCP badge in the app. */

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
  updatedByName?: string
}

export interface SubjectDoc {
  id: string
  name: string
  color: string
}

const notesCol = (wsId: string) => db().collection('workspaces').doc(wsId).collection('notes')
const subjectsCol = (wsId: string) => db().collection('workspaces').doc(wsId).collection('subjects')

export async function listSubjects(wsId: string): Promise<SubjectDoc[]> {
  const snap = await subjectsCol(wsId).get()
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SubjectDoc, 'id'>) }))
}

export async function listNotes(wsId: string, limit = 200): Promise<NoteDoc[]> {
  const snap = await notesCol(wsId).orderBy('updatedAt', 'desc').limit(limit).get()
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NoteDoc, 'id'>) }))
}

export async function getNote(wsId: string, noteId: string): Promise<NoteDoc | null> {
  const doc = await notesCol(wsId).doc(noteId).get()
  if (!doc.exists) return null
  return { id: doc.id, ...(doc.data() as Omit<NoteDoc, 'id'>) }
}

/** Substring search over title/body/tags. Firestore has no FTS; the corpus is
    one workspace's notes, so an in-memory scan over the recent set is adequate. */
export async function searchNotes(wsId: string, query: string, limit = 20): Promise<NoteDoc[]> {
  const all = await listNotes(wsId, 500)
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
  wsId: string,
  client: string,
  data: { title: string; body: string; subjectName?: string; tags?: string[] },
): Promise<NoteDoc> {
  const subjectId = data.subjectName ? await resolveSubject(wsId, data.subjectName) : null
  const ref = await notesCol(wsId).add({
    title: data.title,
    body: data.body,
    subjectId,
    tags: (data.tags ?? []).map(normalizeTag),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    origin: 'mcp',
    originClient: client,
  })
  return (await getNote(wsId, ref.id))!
}

export async function updateNote(
  wsId: string,
  client: string,
  noteId: string,
  patch: { title?: string; body?: string; subjectName?: string; tags?: string[] },
): Promise<NoteDoc | null> {
  const existing = await getNote(wsId, noteId)
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
    update.subjectId = patch.subjectName ? await resolveSubject(wsId, patch.subjectName) : null
  }
  await notesCol(wsId).doc(noteId).update(update)
  return getNote(wsId, noteId)
}

export async function deleteNote(wsId: string, noteId: string): Promise<boolean> {
  const existing = await getNote(wsId, noteId)
  if (!existing) return false
  await notesCol(wsId).doc(noteId).delete()
  return true
}

function normalizeTag(t: string): string {
  return t.trim().replace(/^#/, '').toLowerCase()
}

/** Find a subject by name (case-insensitive); create it if missing. */
async function resolveSubject(wsId: string, name: string): Promise<string> {
  const subjects = await listSubjects(wsId)
  const found = subjects.find((s) => s.name.toLowerCase() === name.trim().toLowerCase())
  if (found) return found.id
  const colors = ['#c67139', '#7a8a5e', '#8a6fa8', '#5d7f8f', '#a13b2a', '#7a5714', '#31505e', '#6b503a']
  const ref = await subjectsCol(wsId).add({
    name: name.trim(),
    color: colors[subjects.length % colors.length],
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

/** Serialize a note for LLM consumption. */
export function noteForLlm(n: NoteDoc, subjects: SubjectDoc[], workspace: { id: string; name: string }) {
  const subject = subjects.find((s) => s.id === n.subjectId)
  return {
    id: n.id,
    workspace: workspace.name,
    workspace_id: workspace.id,
    title: n.title,
    body: n.body,
    subject: subject?.name ?? null,
    tags: n.tags ?? [],
    createdAt: n.createdAt?.toDate().toISOString() ?? null,
    updatedAt: n.updatedAt?.toDate().toISOString() ?? null,
  }
}
