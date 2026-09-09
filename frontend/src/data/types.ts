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
export interface TodoList {
  id: string
  name: string
  createdAt: Timestamp | null
  createdBy: string
  createdByName: string
}

export interface TodoItem {
  id: string
  title: string
  done: boolean
  doneAt: Timestamp | null
  /** Workspace member uid, or null when unassigned. */
  assigneeId: string | null
  assigneeName: string | null
  /** Calendar date as YYYY-MM-DD (no time zone), or null. */
  dueDate: string | null
  addedBy: string
  addedByName: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  origin: 'user' | 'mcp'
  originClient?: string
}
