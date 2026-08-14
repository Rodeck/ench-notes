import type { FastifyReply, FastifyRequest } from 'fastify'
import { auth } from './firebase.js'

export interface AuthedUser {
  uid: string
}

/** Verify a Firebase ID token from the Authorization header (frontend calls). */
export async function requireFirebaseUser(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthedUser | null> {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    await reply.code(401).send({ error: 'missing_token' })
    return null
  }
  try {
    const decoded = await auth().verifyIdToken(token)
    return { uid: decoded.uid }
  } catch {
    await reply.code(401).send({ error: 'invalid_token' })
    return null
  }
}
