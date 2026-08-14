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
}

export type ThemePref = 'system' | 'light' | 'dark'

export interface McpClient {
  id: string
  name: string
  scopes: string[]
  connectedAt: Timestamp | null
  lastUsedAt: Timestamp | null
}
