import type { Timestamp } from 'firebase/firestore'

export interface Note {
  id: string
  title: string
  body: string
  subjectId: string | null
  tags: string[]
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  /** Who made the last edit — powers the MCP badge. */
  origin: 'user' | 'mcp'
  originClient?: string
  /** Display name of the person behind the last edit (shared workspaces). */
  updatedByName?: string
}

export interface Subject {
  id: string
  name: string
  color: string
  createdAt: Timestamp | null
}

export interface UserProfile {
  displayName: string
  email: string
  premium: boolean
  theme: ThemePref
  /** Always the uid today; kept explicit so it can change later. */
  defaultWorkspaceId?: string
}

export type WorkspaceRole = 'owner' | 'member'

export interface WorkspaceMember {
  role: WorkspaceRole
  email: string
  displayName: string
  addedAt?: Timestamp | null
}

/** A container for notes + subjects. The user's default workspace has their
    uid as its id; others are either their own extra workspaces or ones
    shared with them. */
export interface Workspace {
  id: string
  name: string
  ownerId: string
  memberIds: string[]
  members: Record<string, WorkspaceMember>
  createdAt: Timestamp | null
}

export type ThemePref = 'system' | 'light' | 'dark'

export interface McpClient {
  id: string
  name: string
  scopes: string[]
  connectedAt: Timestamp | null
  lastUsedAt: Timestamp | null
}

/** A todo list inside a workspace. Items live in a subcollection so several
    members can edit at the same time without overwriting each other. */
export type TodoListKind = 'list' | 'table'
export type TodoSortField = 'title' | 'done' | 'assignee' | 'priority' | 'dueDate' | 'addedBy' | 'createdAt'

/** Fixed scale, unset by default: readable as a chip, sortable, and easy
    for an assistant to set without guessing what a number means. */
export type TodoPriority = 'high' | 'medium' | 'low'
export const TODO_PRIORITIES: TodoPriority[] = ['high', 'medium', 'low']

/** Table settings, stored on the list doc so every member shares them. */
export interface TodoTableView {
  sort: { field: TodoSortField; dir: 'asc' | 'desc' }
  filters: {
    status: 'all' | 'open' | 'done'
    /** Member uid (item has them among its assignees), 'none' for
        unassigned, null for any. */
    assigneeId: string | null
    priority: 'any' | TodoPriority | 'none'
    due: 'any' | 'overdue' | 'today' | 'week' | 'none'
    /** Member uid or null for any. */
    addedBy: string | null
  }
}

export interface TodoList {
  id: string
  name: string
  /** Simple checklist (default) or a filterable, sortable table. */
  kind?: TodoListKind
  table?: Partial<TodoTableView>
  createdAt: Timestamp | null
  createdBy: string
  createdByName: string
}

export interface TodoAssignee {
  id: string
  name: string
}

export interface TodoItem {
  id: string
  title: string
  done: boolean
  doneAt: Timestamp | null
  /** Workspace members the item is assigned to; empty when unassigned. */
  assignees: TodoAssignee[]
  priority: TodoPriority | null
  /** Calendar date as YYYY-MM-DD (no time zone), or null. */
  dueDate: string | null
  addedBy: string
  addedByName: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  origin: 'user' | 'mcp'
  originClient?: string
}
