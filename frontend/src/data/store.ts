import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db, BACKEND_URL } from '../firebase'
import { auth } from '../firebase'
import type {
  McpClient,
  Note,
  Subject,
  TodoAssignee,
  TodoItem,
  TodoList,
  TodoListKind,
  TodoPriority,
  TodoTableView,
  Workspace,
} from './types'

/* Notes and subjects live under workspaces/{wsId}. Every member of a
   workspace can read and write them (Firestore rules check memberIds).
   Membership changes go through the backend. */

const workspacesCol = () => collection(db(), 'workspaces')
const notesCol = (wsId: string) => collection(db(), 'workspaces', wsId, 'notes')
const subjectsCol = (wsId: string) => collection(db(), 'workspaces', wsId, 'subjects')
const clientsCol = (uid: string) => collection(db(), 'users', uid, 'mcpClients')
const todoListsCol = (wsId: string) => collection(db(), 'workspaces', wsId, 'todoLists')
const todoItemsCol = (wsId: string, listId: string) =>
  collection(db(), 'workspaces', wsId, 'todoLists', listId, 'items')

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

/* ── todo lists ───────────────────────────────────────────────────────── */

export function useTodoLists(wsId: string) {
  const [lists, setLists] = useState<TodoList[] | null>(null)
  useEffect(() => {
    setLists(null)
    const q = query(todoListsCol(wsId), orderBy('createdAt', 'asc'))
    return onSnapshot(
      q,
      (snap) => setLists(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TodoList)),
      (err) => {
        console.error('todo lists listener', err)
        setLists([])
      },
    )
  }, [wsId])
  return lists
}

/** Item doc → TodoItem. Items written before multiple assignees existed
    carry assigneeId/assigneeName; read them as a one-element list. */
export function todoItemOf(id: string, d: Record<string, unknown>): TodoItem {
  const legacy = d.assigneeId ? [{ id: d.assigneeId as string, name: (d.assigneeName as string) ?? '' }] : []
  return {
    ...(d as Omit<TodoItem, 'id' | 'assignees' | 'priority'>),
    id,
    assignees: Array.isArray(d.assignees) ? (d.assignees as TodoAssignee[]) : legacy,
    priority: (d.priority as TodoPriority | undefined) ?? null,
  }
}

/** Open items first (earliest due date first, undated last), then done. */
export function compareTodoItems(a: TodoItem, b: TodoItem): number {
  if (a.done !== b.done) return a.done ? 1 : -1
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate < b.dueDate ? -1 : 1
  }
  return (a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER) - (b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER)
}

export function useTodoItems(wsId: string, listId: string) {
  const [items, setItems] = useState<TodoItem[] | null>(null)
  useEffect(() => {
    setItems(null)
    return onSnapshot(
      todoItemsCol(wsId, listId),
      (snap) => setItems(snap.docs.map((d) => todoItemOf(d.id, d.data())).sort(compareTodoItems)),
      (err) => {
        console.error('todo items listener', err)
        setItems([])
      },
    )
  }, [wsId, listId])
  return items
}

export async function createTodoList(wsId: string, name: string, kind: TodoListKind = 'list'): Promise<string> {
  const u = auth().currentUser
  const ref = await addDoc(todoListsCol(wsId), {
    name: name.trim(),
    kind,
    createdAt: serverTimestamp(),
    createdBy: u?.uid ?? '',
    createdByName: editorName(),
  })
  return ref.id
}

export async function renameTodoList(wsId: string, listId: string, name: string) {
  await updateDoc(doc(db(), 'workspaces', wsId, 'todoLists', listId), { name: name.trim() })
}

export async function setTodoListKind(wsId: string, listId: string, kind: TodoListKind) {
  await updateDoc(doc(db(), 'workspaces', wsId, 'todoLists', listId), { kind })
}

/** Update the shared table view. Dotted paths so two members changing
    different settings at the same time do not overwrite each other. */
export async function setTodoTableView(
  wsId: string,
  listId: string,
  patch: { sort?: TodoTableView['sort']; filters?: Partial<TodoTableView['filters']> },
) {
  const update: Record<string, string | null | TodoTableView['sort']> = {}
  if (patch.sort) update['table.sort'] = patch.sort
  for (const [k, v] of Object.entries(patch.filters ?? {})) update[`table.filters.${k}`] = v ?? null
  if (Object.keys(update).length === 0) return
  await updateDoc(doc(db(), 'workspaces', wsId, 'todoLists', listId), update)
}

/** Delete the list and its items (the client has no recursive delete). */
export async function deleteTodoList(wsId: string, listId: string) {
  const items = await getDocs(todoItemsCol(wsId, listId))
  const batch = writeBatch(db())
  for (const d of items.docs) batch.delete(d.ref)
  batch.delete(doc(db(), 'workspaces', wsId, 'todoLists', listId))
  await batch.commit()
}

export async function addTodoItem(
  wsId: string,
  listId: string,
  data: { title: string; assignees?: TodoAssignee[]; priority?: TodoPriority | null; dueDate?: string | null },
): Promise<string> {
  const u = auth().currentUser
  const ref = await addDoc(todoItemsCol(wsId, listId), {
    title: data.title.trim(),
    done: false,
    doneAt: null,
    assignees: data.assignees ?? [],
    priority: data.priority ?? null,
    dueDate: data.dueDate || null,
    addedBy: u?.uid ?? '',
    addedByName: editorName(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    origin: 'user',
  })
  return ref.id
}

export async function updateTodoItem(
  wsId: string,
  listId: string,
  itemId: string,
  patch: Partial<Pick<TodoItem, 'title' | 'done' | 'assignees' | 'priority' | 'dueDate'>>,
) {
  await updateDoc(doc(db(), 'workspaces', wsId, 'todoLists', listId, 'items', itemId), {
    ...patch,
    ...(patch.done !== undefined ? { doneAt: patch.done ? serverTimestamp() : null } : {}),
    // Drop the pre-multi-assignee fields once the new list is written.
    ...(patch.assignees !== undefined ? { assigneeId: deleteField(), assigneeName: deleteField() } : {}),
    updatedAt: serverTimestamp(),
    origin: 'user',
  })
}

export async function deleteTodoItem(wsId: string, listId: string, itemId: string) {
  await deleteDoc(doc(db(), 'workspaces', wsId, 'todoLists', listId, 'items', itemId))
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
