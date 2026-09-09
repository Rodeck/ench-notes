import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { auth, db } from './firebase.js'

/* Workspaces: the container for notes and subjects.

   workspaces/{wsId}
     name, ownerId, memberIds: string[], members: { [uid]: WorkspaceMember }
     /notes/{noteId}, /subjects/{subjectId}

   Every user has a default workspace whose id is their uid; it is created on
   first sign-in by the app (and lazily here, for MCP clients that connect
   before the app was ever opened). Any member can add/edit/delete notes; the
   owner manages membership. memberIds duplicates members' keys so the app
   can query "workspaces I belong to" with array-contains, which Firestore
   rules can prove safe. */

export type WorkspaceRole = 'owner' | 'member'

export interface WorkspaceMember {
  role: WorkspaceRole
  email: string
  displayName: string
  addedAt?: Timestamp
}

export interface WorkspaceDoc {
  id: string
  name: string
  ownerId: string
  memberIds: string[]
  members: Record<string, WorkspaceMember>
  createdAt?: Timestamp
}

export class WorkspaceError extends Error {
  constructor(
    public code:
      | 'workspace_not_found'
      | 'not_a_member'
      | 'not_owner'
      | 'user_not_found'
      | 'already_member'
      | 'cannot_remove_owner'
      | 'cannot_delete_default',
    public status = 400,
  ) {
    super(code)
  }
}

export const DEFAULT_WORKSPACE_NAME = 'My notes'

const wsCol = () => db().collection('workspaces')

function fromSnap(snap: FirebaseFirestore.DocumentSnapshot): WorkspaceDoc {
  const d = snap.data()!
  return {
    id: snap.id,
    name: d.name ?? '',
    ownerId: d.ownerId,
    memberIds: d.memberIds ?? [],
    members: d.members ?? {},
    createdAt: d.createdAt,
  }
}

export const defaultWorkspaceId = (uid: string) => uid

export async function getWorkspace(wsId: string): Promise<WorkspaceDoc | null> {
  const snap = await wsCol().doc(wsId).get()
  return snap.exists ? fromSnap(snap) : null
}

/** Create the user's default workspace if it does not exist yet. */
export async function ensureDefaultWorkspace(uid: string): Promise<WorkspaceDoc> {
  const ref = wsCol().doc(defaultWorkspaceId(uid))
  const existing = await ref.get()
  if (existing.exists) return fromSnap(existing)

  const user = await auth().getUser(uid).catch(() => null)
  const email = user?.email ?? ''
  const displayName = user?.displayName || email.split('@')[0] || 'Someone'
  try {
    await ref.create({
      name: DEFAULT_WORKSPACE_NAME,
      ownerId: uid,
      memberIds: [uid],
      members: { [uid]: { role: 'owner', email, displayName, addedAt: FieldValue.serverTimestamp() } },
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    // Lost a race with the app creating it; fall through to the read.
    if ((err as { code?: number }).code !== 6 /* ALREADY_EXISTS */) throw err
  }
  return fromSnap(await ref.get())
}

/** All workspaces the user belongs to, default first, then by name. */
export async function listWorkspacesFor(uid: string): Promise<WorkspaceDoc[]> {
  const snap = await wsCol().where('memberIds', 'array-contains', uid).get()
  const list = snap.docs.map(fromSnap)
  if (!list.some((w) => w.id === defaultWorkspaceId(uid))) list.push(await ensureDefaultWorkspace(uid))
  const def = defaultWorkspaceId(uid)
  return list.sort((a, b) => {
    if (a.id === def) return -1
    if (b.id === def) return 1
    return a.name.localeCompare(b.name)
  })
}

/** Load a workspace and verify the user is a member. */
export async function requireMember(wsId: string, uid: string): Promise<WorkspaceDoc> {
  const ws = await getWorkspace(wsId)
  if (!ws) throw new WorkspaceError('workspace_not_found', 404)
  if (!ws.memberIds.includes(uid)) throw new WorkspaceError('not_a_member', 403)
  return ws
}

async function requireOwner(wsId: string, uid: string): Promise<WorkspaceDoc> {
  const ws = await requireMember(wsId, uid)
  if (ws.ownerId !== uid) throw new WorkspaceError('not_owner', 403)
  return ws
}

/** Owner shares the workspace with an existing account, looked up by email. */
export async function addMemberByEmail(
  wsId: string,
  actorUid: string,
  email: string,
): Promise<{ uid: string; member: WorkspaceMember }> {
  const ws = await requireOwner(wsId, actorUid)
  const normalized = email.trim().toLowerCase()
  const user = await auth()
    .getUserByEmail(normalized)
    .catch(() => null)
  if (!user) throw new WorkspaceError('user_not_found', 404)
  if (ws.memberIds.includes(user.uid)) throw new WorkspaceError('already_member', 409)

  const member: WorkspaceMember = {
    role: 'member',
    email: user.email ?? normalized,
    displayName: user.displayName || (user.email ?? normalized).split('@')[0],
  }
  await wsCol()
    .doc(wsId)
    .update({
      memberIds: FieldValue.arrayUnion(user.uid),
      [`members.${user.uid}`]: { ...member, addedAt: FieldValue.serverTimestamp() },
    })
  return { uid: user.uid, member }
}

/** Owner removes a member, or a member removes themselves (leaves). The
    owner cannot be removed. */
export async function removeMember(wsId: string, actorUid: string, targetUid: string): Promise<void> {
  const ws = await requireMember(wsId, actorUid)
  if (targetUid === ws.ownerId) throw new WorkspaceError('cannot_remove_owner', 400)
  if (actorUid !== ws.ownerId && actorUid !== targetUid) throw new WorkspaceError('not_owner', 403)
  if (!ws.memberIds.includes(targetUid)) throw new WorkspaceError('not_a_member', 404)
  await wsCol()
    .doc(wsId)
    .update({
      memberIds: FieldValue.arrayRemove(targetUid),
      [`members.${targetUid}`]: FieldValue.delete(),
    })
}

/** Owner deletes a non-default workspace with everything inside it. */
export async function deleteWorkspace(wsId: string, actorUid: string): Promise<void> {
  const ws = await requireOwner(wsId, actorUid)
  if (ws.id === defaultWorkspaceId(ws.ownerId)) throw new WorkspaceError('cannot_delete_default', 400)
  await db().recursiveDelete(wsCol().doc(wsId))
}
