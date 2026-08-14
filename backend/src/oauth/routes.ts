import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { auth } from '../firebase.js'
import { config } from '../config.js'
import {
  SCOPES,
  consumeAuthCode,
  consumeRefreshToken,
  createAuthCode,
  getClient,
  issueTokens,
  registerClient,
  revokeToken,
  upsertConnection,
} from './store.js'
import { consentPage } from './consent.js'

/* OAuth 2.0 authorization server for the MCP endpoint:
   authorization code + PKCE (S256), dynamic client registration (RFC 7591),
   public clients only (token_endpoint_auth_method: none). */

export function registerOAuthRoutes(app: FastifyInstance) {
  const issuer = config.publicUrl

  app.get('/.well-known/oauth-authorization-server', async () => ({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    scopes_supported: [...SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  }))

  app.get('/.well-known/oauth-protected-resource', async () => ({
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ['header'],
  }))
  app.get('/.well-known/oauth-protected-resource/mcp', async (_req, reply) =>
    reply.redirect('/.well-known/oauth-protected-resource'),
  )

  app.post('/oauth/register', async (req, reply) => {
    const body = (req.body ?? {}) as {
      client_name?: string
      redirect_uris?: string[]
    }
    const redirectUris = body.redirect_uris ?? []
    if (redirectUris.length === 0) {
      return reply.code(400).send({ error: 'invalid_client_metadata', error_description: 'redirect_uris required' })
    }
    for (const uri of redirectUris) {
      let u: URL
      try {
        u = new URL(uri)
      } catch {
        return reply.code(400).send({ error: 'invalid_redirect_uri' })
      }
      const isLoopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
      if (u.protocol !== 'https:' && !isLoopback && u.protocol !== 'http:') {
        // custom schemes (e.g. app callbacks) are allowed; plain http only on loopback
      }
      if (u.protocol === 'http:' && !isLoopback) {
        return reply.code(400).send({ error: 'invalid_redirect_uri', error_description: 'http only on loopback' })
      }
    }
    const client = await registerClient(body.client_name?.slice(0, 100) || 'MCP client', redirectUris)
    return reply.code(201).send({
      client_id: client.clientId,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    })
  })

  app.get('/oauth/authorize', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>
    const clientId = q.client_id ?? ''
    const redirectUri = q.redirect_uri ?? ''
    const state = q.state ?? ''
    const codeChallenge = q.code_challenge ?? ''
    const scope = sanitizeScope(q.scope)

    const client = clientId ? await getClient(clientId) : null
    if (!client) return reply.code(400).type('text/html').send(errorPage('Unknown client.'))
    if (!client.redirectUris.includes(redirectUri)) {
      return reply.code(400).type('text/html').send(errorPage('redirect_uri is not registered for this client.'))
    }
    if (q.response_type !== 'code' || !codeChallenge || q.code_challenge_method !== 'S256') {
      return redirectError(reply, redirectUri, state, 'invalid_request')
    }
    return reply.type('text/html').send(
      consentPage({
        clientName: client.name,
        clientId,
        redirectUri,
        state,
        codeChallenge,
        scope,
        firebase: config.firebaseWeb,
      }),
    )
  })

  // The consent page posts the signed-in user's Firebase ID token + decision.
  app.post('/oauth/decision', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, string>
    const { idToken, client_id, redirect_uri, state, code_challenge, scope, decision } = body

    const client = client_id ? await getClient(client_id) : null
    if (!client || !client.redirectUris.includes(redirect_uri ?? '')) {
      return reply.code(400).send({ error: 'invalid_request' })
    }
    if (decision !== 'approve') {
      return reply.send({ redirect: withParams(redirect_uri, { error: 'access_denied', state }) })
    }
    let uid: string
    try {
      uid = (await auth().verifyIdToken(idToken ?? '')).uid
    } catch {
      return reply.code(401).send({ error: 'invalid_token' })
    }
    const grantedScope = sanitizeScope(scope)
    const code = await createAuthCode({
      uid,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge ?? '',
      scope: grantedScope,
    })
    await upsertConnection(uid, client_id, client.name, grantedScope)
    return reply.send({ redirect: withParams(redirect_uri, { code, state }) })
  })

  app.post('/oauth/token', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, string>
    if (body.grant_type === 'authorization_code') {
      const stored = body.code ? await consumeAuthCode(body.code) : null
      if (!stored) return reply.code(400).send({ error: 'invalid_grant' })
      if (stored.clientId !== body.client_id || stored.redirectUri !== body.redirect_uri) {
        return reply.code(400).send({ error: 'invalid_grant' })
      }
      const verifier = body.code_verifier ?? ''
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      if (challenge !== stored.codeChallenge) {
        return reply.code(400).send({ error: 'invalid_grant', error_description: 'PKCE verification failed' })
      }
      const t = await issueTokens(stored.uid, stored.clientId, stored.scope)
      return reply.send({
        access_token: t.accessToken,
        refresh_token: t.refreshToken,
        token_type: 'Bearer',
        expires_in: t.expiresIn,
        scope: stored.scope,
      })
    }
    if (body.grant_type === 'refresh_token') {
      const stored = body.refresh_token ? await consumeRefreshToken(body.refresh_token) : null
      if (!stored) return reply.code(400).send({ error: 'invalid_grant' })
      const t = await issueTokens(stored.uid, stored.clientId, stored.scope)
      return reply.send({
        access_token: t.accessToken,
        refresh_token: t.refreshToken,
        token_type: 'Bearer',
        expires_in: t.expiresIn,
        scope: stored.scope,
      })
    }
    return reply.code(400).send({ error: 'unsupported_grant_type' })
  })

  app.post('/oauth/revoke', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, string>
    if (body.token) await revokeToken(body.token)
    return reply.send({})
  })
}

function sanitizeScope(scope: string | undefined): string {
  const requested = (scope ?? 'read write').split(/[\s+]+/).filter(Boolean)
  const granted = requested.filter((s) => (SCOPES as readonly string[]).includes(s))
  return granted.length > 0 ? granted.join(' ') : 'read'
}

function withParams(base: string, params: Record<string, string | undefined>): string {
  const u = new URL(base)
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v)
  return u.toString()
}

function redirectError(reply: import('fastify').FastifyReply, redirectUri: string, state: string, error: string) {
  return reply.redirect(withParams(redirectUri, { error, state }))
}

function errorPage(msg: string): string {
  return `<!doctype html><meta charset="utf-8"><title>ench notes</title><body style="font-family:system-ui;padding:40px;"><h2>Can’t continue</h2><p>${msg}</p></body>`
}
