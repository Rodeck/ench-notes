import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db, BACKEND_URL } from '../firebase'
import { auth } from '../firebase'
import type { McpClient, Note, Subject, Workspace } from './types'

/* Notes and subjects live under workspaces/{wsId}. Every member of a
   workspace can read and write them (Firestore rules check memberIds).
   Membership changes go through the backend. */

const workspacesCol = () => collection(db(), 'workspaces')
const notesCol = (wsId: string) => collection(db(), 'workspaces', wsId, 'notes')
const subjectsCol = (wsId: string) => collection(db(), 'workspaces', wsId, 'subjects')
const clientsCol = (uid: string) => collection(db(), 'users', uid, 'mcpClients')

export const DEFAULT_WORKSPACE_NAME = 'My notes'

/** The default workspace's id is the uid — no lookup, no race on creation. */
export const defaultWorkspaceId = (uid: string) => uid

function displayNameOf(user: User): string {
  return user.displayName ?? user.email?.split('@')[0] ?? 'Someone'
}

/** Create the user's default workspace on first sign-in (idempotent). */
export async function ensureDefaultWorkspace(user: User) {
  const ref = doc(db(), 'workspaces', defaultWorkspaceId(user.uid))
  const snap = await getDoc(ref)
  if (snap.exists()) return
  await setDoc(ref, {
    name: DEFAULT_WORKSPACE_NAME,
    ownerId: user.uid,
    memberIds: [user.uid],
    members: {
      [user.uid]: {
        role: 'owner',
        email: user.email ?? '',
        displayName: displayNameOf(user),
        addedAt: serverTimestamp(),
      },
    },
    createdAt: serverTimestamp(),
  })
}

/** Workspaces the user belongs to: default first, then own, then shared, by name. */
export function useWorkspaces(uid: string) {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)
  useEffect(() => {
    const q = query(workspacesCol(), where('memberIds', 'array-contains', uid))
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Workspace)
      const def = defaultWorkspaceId(uid)
      list.sort((a, b) => {
        if (a.id === def) return -1
        if (b.id === def) return 1
        const aOwn = a.ownerId === uid ? 0 : 1
        const bOwn = b.ownerId === uid ? 0 : 1
        if (aOwn !== bOwn) return aOwn - bOwn
        return a.name.localeCompare(b.name)
      })
      setWorkspaces(list)
    })
  }, [uid])
  return workspaces
}

export function useNotes(wsId: string, sort: 'updatedAt' | 'createdAt') {
  const [notes, setNotes] = useState<Note[] | null>(null)
  useEffect(() => {
    setNotes(null)
    const q = query(notesCol(wsId), orderBy(sort, 'desc'))
    return onSnapshot(
      q,
      (snap) => setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Note)),
      // permission-denied once the user is removed from the workspace; the
      // workspace list updates and the parent switches away.
      (err) => {
        console.error('notes listener', err)
        setNotes([])
      },
    )
  }, [wsId, sort])
  return notes
}

export function useSubjects(wsId: string) {
  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  useEffect(() => {
    setSubjects(null)
    const q = query(subjectsCol(wsId), orderBy('createdAt', 'asc'))
    return onSnapshot(
      q,
      (snap) => setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Subject)),
      (err) => {
        console.error('subjects listener', err)
        setSubjects([])
      },
    )
  }, [wsId])
  return subjects
}

export function useMcpClients(uid: string) {
  const [clients, setClients] = useState<McpClient[] | null>(null)
  useEffect(() => {
    return onSnapshot(clientsCol(uid), (snap) => {
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as McpClient))
    })
  }, [uid])
  return clients
}

function editorName(): string {
  const u = auth().currentUser
  return u ? displayNameOf(u) : 'Someone'
}

export async function createNote(wsId: string, subjectId: string | null): Promise<string> {
  const ref = await addDoc(notesCol(wsId), {
    title: '',
    body: '',
    subjectId,
    tags: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    origin: 'user',
    updatedByName: editorName(),
  })
  return ref.id
}

export async function updateNote(
  wsId: string,
  noteId: string,
  patch: Partial<Pick<Note, 'title' | 'body' | 'subjectId' | 'tags'>>,
) {
  await updateDoc(doc(db(), 'workspaces', wsId, 'notes', noteId), {
    ...patch,
    updatedAt: serverTimestamp(),
    origin: 'user',
    updatedByName: editorName(),
  })
}

export async function deleteNote(wsId: string, noteId: string) {
  await deleteDoc(doc(db(), 'workspaces', wsId, 'notes', noteId))
}

export async function createSubject(wsId: string, name: string, color: string) {
  await addDoc(subjectsCol(wsId), { name, color, createdAt: serverTimestamp() })
}

export async function createWorkspace(user: User, name: string): Promise<string> {
  const ref = await addDoc(workspacesCol(), {
    name,
    ownerId: user.uid,
    memberIds: [user.uid],
    members: {
      [user.uid]: {
        role: 'owner',
        email: user.email ?? '',
        displayName: displayNameOf(user),
        addedAt: serverTimestamp(),
      },
    },
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function renameWorkspace(wsId: string, name: string) {
  await updateDoc(doc(db(), 'workspaces', wsId), { name, updatedAt: serverTimestamp() })
}

export async function revokeMcpClient(uid: string, clientId: string) {
  await deleteDoc(doc(db(), 'users', uid, 'mcpClients', clientId))
}

/* ── backend calls ────────────────────────────────────────────────────── */

async function backend(path: string, init: RequestInit = {}): Promise<Response> {
  if (!BACKEND_URL) throw new Error('This needs the backend — set VITE_BACKEND_URL once it’s deployed.')
  const token = await auth().currentUser?.getIdToken()
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      // Fastify rejects a JSON content-type with an empty body (DELETEs).
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
}

const WORKSPACE_ERRORS: Record<string, string> = {
  user_not_found: 'No ench notes account uses that email — they need to sign up first.',
  already_member: 'That person is already in this workspace.',
  not_owner: 'Only the workspace owner can do that.',
  cannot_remove_owner: 'The owner can’t be removed from their own workspace.',
  cannot_delete_default: 'Your default workspace can’t be deleted.',
  invalid_email: 'That doesn’t look like an email address.',
}

async function throwWorkspaceError(res: Response): Promise<never> {
  let code = ''
  try {
    code = ((await res.json()) as { error?: string }).error ?? ''
  } catch {
    /* no body */
  }
  throw new Error(WORKSPACE_ERRORS[code] ?? 'That didn’t work — try again in a moment.')
}

/** Share a workspace with an existing account by email (owner only). */
export async function shareWorkspace(wsId: string, email: string) {
  const res = await backend(`/api/workspaces/${wsId}/members`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
  if (!res.ok) await throwWorkspaceError(res)
}

/** Remove a member (owner) or leave (member removing themselves). */
export async function removeWorkspaceMember(wsId: string, uid: string) {
  const res = await backend(`/api/workspaces/${wsId}/members/${uid}`, { method: 'DELETE' })
  if (!res.ok) await throwWorkspaceError(res)
}

/** Delete a non-default workspace and everything in it (owner only). */
export async function deleteWorkspace(wsId: string) {
  const res = await backend(`/api/workspaces/${wsId}`, { method: 'DELETE' })
  if (!res.ok) await throwWorkspaceError(res)
}

/** Premium tag suggestions from the VPS backend. Throws with a friendly message. */
export async function suggestTags(note: Note): Promise<string[]> {
  if (!BACKEND_URL) {
    throw new Error('Tag suggestions need the backend — set VITE_BACKEND_URL once it’s deployed.')
  }
  const res = await backend('/api/suggest-tags', {
    method: 'POST',
    body: JSON.stringify({ title: note.title, body: note.body, existingTags: note.tags }),
  })
  if (!res.ok) throw new Error('Tag suggestions are unavailable right now — try again in a moment.')
  const data = (await res.json()) as { tags?: string[] }
  return (data.tags ?? []).filter((t) => !note.tags.includes(t)).slice(0, 5)
}
