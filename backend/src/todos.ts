import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from './firebase.js'
import type { WorkspaceDoc } from './workspaces.js'

/* Todo lists: workspaces/{wsId}/todoLists/{listId}/items/{itemId}.
   Mirrors the frontend's data contract. Callers must have verified the user
   is a member of the workspace. MCP writes stamp origin: 'mcp'. */

export interface TodoListDoc {
  id: string
  name: string
  createdAt?: Timestamp
  createdBy: string
  createdByName: string
}

export interface TodoItemDoc {
  id: string
  title: string
  done: boolean
  doneAt?: Timestamp | null
  assigneeId: string | null
  assigneeName: string | null
  dueDate: string | null
  addedBy: string
  addedByName: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  origin?: string
  originClient?: string
}

export interface Actor {
  uid: string
  name: string
  client: string
}

const listsCol = (wsId: string) => db().collection('workspaces').doc(wsId).collection('todoLists')
const itemsCol = (wsId: string, listId: string) => listsCol(wsId).doc(listId).collection('items')

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Validate a YYYY-MM-DD date; returns null for empty, throws for garbage. */
export function normalizeDueDate(v: string | null | undefined): string | null {
  if (v === undefined || v === null || v.trim() === '') return null
  const s = v.trim()
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) throw new Error('invalid_due_date')
  return s
}

export async function listTodoLists(wsId: string): Promise<TodoListDoc[]> {
  const snap = await listsCol(wsId).orderBy('createdAt', 'asc').get()
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TodoListDoc, 'id'>) }))
}

export async function getTodoList(wsId: string, listId: string): Promise<TodoListDoc | null> {
  const doc = await listsCol(wsId).doc(listId).get()
  if (!doc.exists) return null
  return { id: doc.id, ...(doc.data() as Omit<TodoListDoc, 'id'>) }
}

/** Find a list by id or case-insensitive name. */
export async function resolveTodoList(wsId: string, ref: string): Promise<TodoListDoc | null> {
  const id = ref.trim()
  const byId = await getTodoList(wsId, id)
  if (byId) return byId
  const needle = id.toLowerCase()
  return (await listTodoLists(wsId)).find((l) => l.name.toLowerCase() === needle) ?? null
}

export async function createTodoList(wsId: string, actor: Actor, name: string): Promise<TodoListDoc> {
  const ref = await listsCol(wsId).add({
    name: name.trim(),
    createdAt: FieldValue.serverTimestamp(),
    createdBy: actor.uid,
    createdByName: actor.name,
  })
  return (await getTodoList(wsId, ref.id))!
}

export async function renameTodoList(wsId: string, listId: string, name: string): Promise<TodoListDoc | null> {
  if (!(await getTodoList(wsId, listId))) return null
  await listsCol(wsId).doc(listId).update({ name: name.trim() })
  return getTodoList(wsId, listId)
}

export async function deleteTodoList(wsId: string, listId: string): Promise<boolean> {
  if (!(await getTodoList(wsId, listId))) return false
  await db().recursiveDelete(listsCol(wsId).doc(listId))
  return true
}

/** Items: open first (due date ascending, undated last), then done. */
export async function listItems(wsId: string, listId: string): Promise<TodoItemDoc[]> {
  const snap = await itemsCol(wsId, listId).get()
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TodoItemDoc, 'id'>) }))
  return items.sort(compareItems)
}

export function compareItems(a: TodoItemDoc, b: TodoItemDoc): number {
  if (a.done !== b.done) return a.done ? 1 : -1
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate < b.dueDate ? -1 : 1
  }
  return (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)
}

export async function getItem(wsId: string, listId: string, itemId: string): Promise<TodoItemDoc | null> {
  const doc = await itemsCol(wsId, listId).doc(itemId).get()
  if (!doc.exists) return null
  return { id: doc.id, ...(doc.data() as Omit<TodoItemDoc, 'id'>) }
}

export interface Assignee {
  id: string
  name: string
}

/** Resolve a member by uid, display name, or email (case-insensitive). */
export function resolveAssignee(ws: WorkspaceDoc, ref: string): Assignee | null {
  const needle = ref.trim().toLowerCase()
  if (!needle) return null
  for (const [uid, m] of Object.entries(ws.members)) {
    if (uid === ref.trim() || m.displayName.toLowerCase() === needle || m.email.toLowerCase() === needle) {
      return { id: uid, name: m.displayName || m.email }
    }
  }
  return null
}

export async function addItem(
  wsId: string,
  listId: string,
  actor: Actor,
  data: { title: string; assignee?: Assignee | null; dueDate?: string | null },
): Promise<TodoItemDoc> {
  const ref = await itemsCol(wsId, listId).add({
    title: data.title.trim(),
    done: false,
    doneAt: null,
    assigneeId: data.assignee?.id ?? null,
    assigneeName: data.assignee?.name ?? null,
    dueDate: normalizeDueDate(data.dueDate),
    addedBy: actor.uid,
    addedByName: actor.name,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    origin: 'mcp',
    originClient: actor.client,
  })
  return (await getItem(wsId, listId, ref.id))!
}

export async function updateItem(
  wsId: string,
  listId: string,
  itemId: string,
  actor: Actor,
  patch: { title?: string; done?: boolean; assignee?: Assignee | null; dueDate?: string | null },
): Promise<TodoItemDoc | null> {
  const existing = await getItem(wsId, listId, itemId)
  if (!existing) return null
  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    origin: 'mcp',
    originClient: actor.client,
  }
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.done !== undefined) {
    update.done = patch.done
    update.doneAt = patch.done ? FieldValue.serverTimestamp() : null
  }
  if (patch.assignee !== undefined) {
    update.assigneeId = patch.assignee?.id ?? null
    update.assigneeName = patch.assignee?.name ?? null
  }
  if (patch.dueDate !== undefined) update.dueDate = normalizeDueDate(patch.dueDate)
  await itemsCol(wsId, listId).doc(itemId).update(update)
  return getItem(wsId, listId, itemId)
}

export async function deleteItem(wsId: string, listId: string, itemId: string): Promise<boolean> {
  if (!(await getItem(wsId, listId, itemId))) return false
  await itemsCol(wsId, listId).doc(itemId).delete()
  return true
}

/** Serialize for LLM consumption. */
export function itemForLlm(i: TodoItemDoc, list: TodoListDoc, workspace: { id: string; name: string }) {
  return {
    id: i.id,
    list: list.name,
    list_id: list.id,
    workspace: workspace.name,
    workspace_id: workspace.id,
    title: i.title,
    done: i.done,
    assignee: i.assigneeName,
    due_date: i.dueDate,
    added_by: i.addedByName,
    createdAt: i.createdAt?.toDate().toISOString() ?? null,
    doneAt: i.doneAt?.toDate().toISOString() ?? null,
  }
}

export function listForLlm(
  l: TodoListDoc,
  items: TodoItemDoc[],
  workspace: { id: string; name: string },
) {
  return {
    id: l.id,
    name: l.name,
    workspace: workspace.name,
    workspace_id: workspace.id,
    created_by: l.createdByName,
    open: items.filter((i) => !i.done).length,
    done: items.filter((i) => i.done).length,
  }
}
