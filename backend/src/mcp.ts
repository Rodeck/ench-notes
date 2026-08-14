import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { config } from './config.js'
import { verifyAccessToken, type McpAuthContext } from './oauth/store.js'
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  listSubjects,
  noteForLlm,
  searchNotes,
  updateNote,
} from './notes.js'

/* MCP server (Streamable HTTP, stateless: one transport per request).
   Bearer tokens come from the OAuth layer in ./oauth. */

function text(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function buildServer(ctx: McpAuthContext): McpServer {
  const server = new McpServer({ name: 'ench-notes', version: '0.1.0' })
  const canWrite = ctx.scopes.includes('write')

  server.registerTool(
    'search_notes',
    {
      description:
        "Search the user's personal notes by keyword (matches title, body, and tags). " +
        'Use this to recall what the user knows, has decided, or is working on — their notes ' +
        'are organized by subject (projects, lifestyle, …) and act as your long-term memory about them. ' +
        'Call with an empty query to list the most recently updated notes.',
      inputSchema: {
        query: z.string().describe('Keywords to search for; empty string lists recent notes'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
      },
    },
    async ({ query, limit }) => {
      const subjects = await listSubjects(ctx.uid)
      const notes = query.trim()
        ? await searchNotes(ctx.uid, query, limit ?? 10)
        : await listNotes(ctx.uid, limit ?? 10)
      return text(notes.map((n) => noteForLlm(n, subjects)))
    },
  )

  server.registerTool(
    'get_note',
    {
      description: 'Fetch one note in full by its id (ids come from search_notes results).',
      inputSchema: { note_id: z.string() },
    },
    async ({ note_id }) => {
      const note = await getNote(ctx.uid, note_id)
      if (!note) return text({ error: 'note_not_found' })
      return text(noteForLlm(note, await listSubjects(ctx.uid)))
    },
  )

  server.registerTool(
    'list_subjects',
    {
      description:
        "List the user's subjects (their note categories, e.g. projects or life areas) with ids and names. " +
        'Use subject names when creating or filing notes so they land in the right place.',
      inputSchema: {},
    },
    async () => text((await listSubjects(ctx.uid)).map((s) => ({ id: s.id, name: s.name }))),
  )

  if (canWrite) {
    server.registerTool(
      'create_note',
      {
        description:
          'Create a new note for the user. Body is markdown. Give it a clear title and file it ' +
          'under an existing subject when one fits (see list_subjects); a new subject name creates that subject. ' +
          'Use this to remember durable facts, decisions, and context the user will want later.',
        inputSchema: {
          title: z.string().min(1),
          body: z.string().describe('Markdown content'),
          subject: z.string().optional().describe('Subject name to file the note under'),
          tags: z.array(z.string()).optional().describe('Short lowercase tags'),
        },
      },
      async ({ title, body, subject, tags }) => {
        const note = await createNote(ctx.uid, ctx.clientName, { title, body, subjectName: subject, tags })
        return text(noteForLlm(note, await listSubjects(ctx.uid)))
      },
    )

    server.registerTool(
      'update_note',
      {
        description:
          'Update an existing note (any of title, body, subject, tags). Only pass the fields to change; ' +
          'body replaces the whole markdown content, so read the note first when editing part of it.',
        inputSchema: {
          note_id: z.string(),
          title: z.string().optional(),
          body: z.string().optional(),
          subject: z.string().optional(),
          tags: z.array(z.string()).optional(),
        },
      },
      async ({ note_id, ...patch }) => {
        const note = await updateNote(ctx.uid, ctx.clientName, note_id, {
          title: patch.title,
          body: patch.body,
          subjectName: patch.subject,
          tags: patch.tags,
        })
        if (!note) return text({ error: 'note_not_found' })
        return text(noteForLlm(note, await listSubjects(ctx.uid)))
      },
    )

    server.registerTool(
      'delete_note',
      {
        description: 'Permanently delete a note. Only do this when the user clearly asks for it.',
        inputSchema: { note_id: z.string() },
      },
      async ({ note_id }) => {
        const ok = await deleteNote(ctx.uid, note_id)
        return text(ok ? { deleted: note_id } : { error: 'note_not_found' })
      },
    )
  }

  return server
}

async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<McpAuthContext | null> {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const ctx = token ? await verifyAccessToken(token) : null
  if (!ctx) {
    reply
      .code(401)
      .header(
        'WWW-Authenticate',
        `Bearer resource_metadata="${config.publicUrl}/.well-known/oauth-protected-resource"`,
      )
      .send({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized' },
        id: null,
      })
    return null
  }
  return ctx
}

export function registerMcpRoutes(app: FastifyInstance) {
  app.post('/mcp', async (req, reply) => {
    const ctx = await authenticate(req, reply)
    if (!ctx) return
    const server = buildServer(ctx)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    })
    reply.hijack()
    try {
      await server.connect(transport)
      await transport.handleRequest(req.raw, reply.raw, req.body)
    } catch (err) {
      req.log.error({ err }, 'mcp request failed')
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' })
        reply.raw.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }))
      }
    } finally {
      reply.raw.on('close', () => {
        void transport.close()
        void server.close()
      })
    }
  })

  // Stateless server: no SSE stream to resume, no session to delete.
  app.get('/mcp', async (_req, reply) => reply.code(405).send({ error: 'method_not_allowed' }))
  app.delete('/mcp', async (_req, reply) => reply.code(405).send({ error: 'method_not_allowed' }))
}
