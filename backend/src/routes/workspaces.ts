import type { FastifyInstance, FastifyReply } from 'fastify'
import { requireFirebaseUser } from '../auth.js'
import { WorkspaceError, addMemberByEmail, deleteWorkspace, removeMember } from '../workspaces.js'

/* Workspace membership for the app. Creating and renaming workspaces happen
   client-side under Firestore rules; these routes cover what the client
   cannot do safely: resolving an invitee's email to a uid, editing the
   membership fields, and deleting a workspace with its subcollections. */

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof WorkspaceError) return reply.code(err.status).send({ error: err.code })
  throw err
}

export function registerWorkspaceRoutes(app: FastifyInstance) {
  app.post('/api/workspaces/:id/members', async (req, reply) => {
    const user = await requireFirebaseUser(req, reply)
    if (!user) return
    const { id } = req.params as { id: string }
    const email = String((req.body as { email?: string } | null)?.email ?? '').trim()
    if (!email || !email.includes('@')) return reply.code(400).send({ error: 'invalid_email' })
    try {
      const added = await addMemberByEmail(id, user.uid, email)
      return reply.code(201).send(added)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.delete('/api/workspaces/:id/members/:uid', async (req, reply) => {
    const user = await requireFirebaseUser(req, reply)
    if (!user) return
    const { id, uid } = req.params as { id: string; uid: string }
    try {
      await removeMember(id, user.uid, uid)
      return reply.send({ removed: uid })
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.delete('/api/workspaces/:id', async (req, reply) => {
    const user = await requireFirebaseUser(req, reply)
    if (!user) return
    const { id } = req.params as { id: string }
    try {
      await deleteWorkspace(id, user.uid)
      return reply.send({ deleted: id })
    } catch (err) {
      return sendError(reply, err)
    }
  })
}
