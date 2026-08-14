import { createHash, randomBytes } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db } from '../firebase.js'

/* OAuth storage. Tokens are opaque random strings; only SHA-256 hashes are
   persisted. Firestore layout (admin-only collections):
     oauthClients/{clientId}   — dynamic client registrations
     oauthCodes/{codeHash}     — short-lived authorization codes
     oauthTokens/{tokenHash}   — access + refresh tokens
     users/{uid}/mcpClients/{clientId} — the user-visible connection; deleting
       it from the app revokes the client (checked on every MCP request). */

export const SCOPES = ['read', 'write'] as const
export type Scope = (typeof SCOPES)[number]

const ACCESS_TTL_MS = 60 * 60 * 1000 // 1h
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30d
const CODE_TTL_MS = 10 * 60 * 1000 // 10min

export function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

export function randomToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`
}

export interface OAuthClient {
  clientId: string
  name: string
  redirectUris: string[]
}

export async function registerClient(name: string, redirectUris: string[]): Promise<OAuthClient> {
  const clientId = randomToken('client')
  await db().collection('oauthClients').doc(clientId).set({
    name,
    redirectUris,
    createdAt: FieldValue.serverTimestamp(),
  })
  return { clientId, name, redirectUris }
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const doc = await db().collection('oauthClients').doc(clientId).get()
  if (!doc.exists) return null
  const d = doc.data()!
  return { clientId: doc.id, name: d.name, redirectUris: d.redirectUris ?? [] }
}

export async function createAuthCode(params: {
  uid: string
  clientId: string
  redirectUri: string
  codeChallenge: string
  scope: string
}): Promise<string> {
  const code = randomToken('code')
  await db()
    .collection('oauthCodes')
    .doc(sha256(code))
    .set({
      ...params,
      expiresAt: Timestamp.fromMillis(Date.now() + CODE_TTL_MS),
    })
  return code
}

export async function consumeAuthCode(code: string) {
  const ref = db().collection('oauthCodes').doc(sha256(code))
  const doc = await ref.get()
  if (!doc.exists) return null
  await ref.delete()
  const d = doc.data()!
  if ((d.expiresAt as Timestamp).toMillis() < Date.now()) return null
  return d as {
    uid: string
    clientId: string
    redirectUri: string
    codeChallenge: string
    scope: string
  }
}

export async function issueTokens(uid: string, clientId: string, scope: string) {
  const accessToken = randomToken('enat')
  const refreshToken = randomToken('enrt')
  const batch = db().batch()
  batch.set(db().collection('oauthTokens').doc(sha256(accessToken)), {
    type: 'access',
    uid,
    clientId,
    scope,
    expiresAt: Timestamp.fromMillis(Date.now() + ACCESS_TTL_MS),
  })
  batch.set(db().collection('oauthTokens').doc(sha256(refreshToken)), {
    type: 'refresh',
    uid,
    clientId,
    scope,
    expiresAt: Timestamp.fromMillis(Date.now() + REFRESH_TTL_MS),
  })
  await batch.commit()
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_MS / 1000 }
}

export async function consumeRefreshToken(refreshToken: string) {
  const ref = db().collection('oauthTokens').doc(sha256(refreshToken))
  const doc = await ref.get()
  if (!doc.exists) return null
  const d = doc.data()!
  if (d.type !== 'refresh') return null
  await ref.delete() // rotation: refresh tokens are single-use
  if ((d.expiresAt as Timestamp).toMillis() < Date.now()) return null
  return d as { uid: string; clientId: string; scope: string }
}

export async function revokeToken(token: string) {
  await db().collection('oauthTokens').doc(sha256(token)).delete()
}

export interface McpAuthContext {
  uid: string
  clientId: string
  clientName: string
  scopes: Scope[]
}

/** Verify an MCP bearer token. The users/{uid}/mcpClients/{clientId} doc is
    the user's revocation switch: the app deletes it on "Revoke", which makes
    this check fail immediately regardless of token expiry. */
export async function verifyAccessToken(token: string): Promise<McpAuthContext | null> {
  const doc = await db().collection('oauthTokens').doc(sha256(token)).get()
  if (!doc.exists) return null
  const d = doc.data()!
  if (d.type !== 'access') return null
  if ((d.expiresAt as Timestamp).toMillis() < Date.now()) return null

  const connRef = db()
    .collection('users')
    .doc(d.uid)
    .collection('mcpClients')
    .doc(d.clientId)
  const conn = await connRef.get()
  if (!conn.exists) return null

  connRef.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {})
  return {
    uid: d.uid,
    clientId: d.clientId,
    clientName: (conn.data()!.name as string) ?? 'MCP client',
    scopes: String(d.scope).split(' ').filter((s): s is Scope => SCOPES.includes(s as Scope)),
  }
}

/** Create/refresh the user-visible connection entry when tokens are issued. */
export async function upsertConnection(uid: string, clientId: string, name: string, scope: string) {
  await db()
    .collection('users')
    .doc(uid)
    .collection('mcpClients')
    .doc(clientId)
    .set(
      {
        name,
        scopes: scope.split(' '),
        connectedAt: FieldValue.serverTimestamp(),
        lastUsedAt: null,
      },
      { merge: true },
    )
}
