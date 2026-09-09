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
  type NoteDoc,
} from './notes.js'
import { defaultWorkspaceId, listWorkspacesFor, type WorkspaceDoc } from './workspaces.js'
import {
  addItem,
  createTodoList,
  deleteItem,
  deleteTodoList,
  getItem,
  itemForLlm,
  listForLlm,
  listItems,
  listTodoLists,
  resolveAssignee,
  resolveTodoList,
  updateItem,
  type Actor,
  type TodoItemDoc,
  type TodoListDoc,
} from './todos.js'

/* MCP server (Streamable HTTP, stateless: one transport per request).
   Bearer tokens come from the OAuth layer in ./oauth.

   Notes and todo lists live in workspaces. A user always has a default
   (personal) workspace and may belong to workspaces other users shared with
   them. Every tool resolves its target workspace from the caller's
   memberships, so a token can never reach a workspace its user is not a
   member of. */

function text(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

const workspaceParam = z
  .string()
  .optional()
  .describe(
    'Workspace name or id (see list_workspaces). Omit to use the default workspace for writes, ' +
      'or to search across every workspace the user can access for reads.',
  )

function workspaceForLlm(w: WorkspaceDoc, uid: string) {
  return {
    id: w.id,
    name: w.name,
    is_default: w.id === defaultWorkspaceId(uid),
    role: w.ownerId === uid ? 'owner' : 'member',
    shared: w.memberIds.length > 1,
    members: Object.values(w.members).map((m) => m.displayName || m.email),
  }
}

/** The caller's workspaces, loaded once per request and used to resolve
    every workspace reference. Anything not in this list is invisible. */
class WorkspaceScope {
  private cache: WorkspaceDoc[] | null = null
  constructor(private uid: string) {}

  async all(): Promise<WorkspaceDoc[]> {
    if (!this.cache) this.cache = await listWorkspacesFor(this.uid)
    return this.cache
  }

  /** Resolve by id or case-insensitive name; the default workspace when
      omitted; null when nothing the user can access matches. */
  async resolve(ref: string | undefined): Promise<WorkspaceDoc | null> {
    const all = await this.all()
    if (!ref || !ref.trim()) return all.find((w) => w.id === defaultWorkspaceId(this.uid)) ?? all[0] ?? null
    const id = ref.trim()
    const needle = id.toLowerCase()
    return all.find((w) => w.id === id) ?? all.find((w) => w.name.toLowerCase() === needle) ?? null
  }

  /** Workspaces a read should cover: the named one, or all of them. */
  async forRead(ref: string | undefined): Promise<WorkspaceDoc[] | null> {
    if (!ref || !ref.trim()) return this.all()
    const one = await this.resolve(ref)
    return one ? [one] : null
  }

  /** Find a todo list by id or name in the named workspace, or in any accessible one. */
  async locateList(ref: string, workspace: string | undefined): Promise<{ ws: WorkspaceDoc; list: TodoListDoc } | null> {
    const candidates = await this.forRead(workspace)
    if (!candidates) return null
    for (const ws of candidates) {
      const list = await resolveTodoList(ws.id, ref)
      if (list) return { ws, list }
    }
    return null
  }

  /** Find a todo item by id: in the given list, or in every list the user can see. */
  async locateItem(
    itemId: string,
    listRef: string | undefined,
    workspace: string | undefined,
  ): Promise<{ ws: WorkspaceDoc; list: TodoListDoc; item: TodoItemDoc } | null> {
    if (listRef) {
      const hit = await this.locateList(listRef, workspace)
      if (!hit) return null
      const item = await getItem(hit.ws.id, hit.list.id, itemId)
      return item ? { ...hit, item } : null
    }
    const candidates = await this.forRead(workspace)
    if (!candidates) return null
    for (const ws of candidates) {
      for (const list of await listTodoLists(ws.id)) {
        const item = await getItem(ws.id, list.id, itemId)
        if (item) return { ws, list, item }
      }
    }
    return null
  }

  /** Find a note by id in the named workspace, or in any accessible one. */
  async locateNote(
    noteId: string,
    ref: string | undefined,
  ): Promise<{ ws: WorkspaceDoc; note: NoteDoc } | null> {
    const candidates = await this.forRead(ref)
    if (!candidates) return null
    for (const ws of candidates) {
      const note = await getNote(ws.id, noteId)
      if (note) return { ws, note }
    }
    return null
  }
}

const listParam = z.string().describe('Todo list name or id (see list_todo_lists)')
const assigneeParam = z
  .string()
  .optional()
  .describe('Workspace member to assign, by display name or email; empty string to unassign')
const dueDateParam = z.string().optional().describe('Due date as YYYY-MM-DD; empty string to clear')

/** Who is acting, for the "added by" fields: the member's display name. */
function actorFor(ctx: McpAuthContext, ws: WorkspaceDoc): Actor {
  const m = ws.members[ctx.uid]
  return { uid: ctx.uid, name: m?.displayName || m?.email || 'Someone', client: ctx.clientName }
}

/** Assignee ref -> member; undefined when not given, null to clear. */
function assigneeFor(ws: WorkspaceDoc, ref: string | undefined) {
  if (ref === undefined) return undefined
  if (!ref.trim()) return null
  const found = resolveAssignee(ws, ref)
  if (!found) throw new Error('assignee_not_found')
  return found
}

const listNotFound = (ref: string) =>
  text({ error: 'todo_list_not_found', message: `No todo list matches "${ref}". Call list_todo_lists.` })

const workspaceNotFound = (ref: string | undefined) =>
  text({
    error: 'workspace_not_found',
    message: `No accessible workspace matches "${ref}". Call list_workspaces to see the options.`,
  })

function buildServer(ctx: McpAuthContext): McpServer {
  const server = new McpServer({ name: 'ench-notes', version: '0.2.0' })
  const canWrite = ctx.scopes.includes('write')
  const scope = new WorkspaceScope(ctx.uid)

  server.registerTool(
    'list_workspaces',
    {
      description:
        'List the workspaces the user can access. Each user has a default personal workspace; ' +
        'other workspaces may be shared with them by other users (shared notes and todo lists). ' +
        'Pass a workspace name or id to the other tools to target it. Reads cover all workspaces ' +
        'by default; writes go to the personal one by default.',
      inputSchema: {},
    },
    async () => text((await scope.all()).map((w) => workspaceForLlm(w, ctx.uid))),
  )

  server.registerTool(
    'search_notes',
    {
      description:
        "Search the user's notes by keyword (matches title, body, and tags). " +
        'Use this to recall what the user knows, has decided, or is working on — their notes ' +
        'are organized by subject (projects, lifestyle, …) and act as your long-term memory about them. ' +
        'Call with an empty query to list the most recently updated notes. Searches every workspace the ' +
        'user can access unless a workspace is given; each result names its workspace.',
      inputSchema: {
        query: z.string().describe('Keywords to search for; empty string lists recent notes'),
        workspace: workspaceParam,
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
      },
    },
    async ({ query, workspace, limit }) => {
      const targets = await scope.forRead(workspace)
      if (!targets) return workspaceNotFound(workspace)
      const max = limit ?? 10
      const perWorkspace = await Promise.all(
        targets.map(async (ws) => {
          const subjects = await listSubjects(ws.id)
          const notes = query.trim() ? await searchNotes(ws.id, query, max) : await listNotes(ws.id, max)
          return notes.map((n) => ({ note: noteForLlm(n, subjects, ws), t: n.updatedAt?.toMillis() ?? 0 }))
        }),
      )
      const merged = perWorkspace
        .flat()
        .sort((a, b) => b.t - a.t)
        .slice(0, max)
        .map((x) => x.note)
      return text(merged)
    },
  )

  server.registerTool(
    'get_note',
    {
      description: 'Fetch one note in full by its id (ids come from search_notes results).',
      inputSchema: { note_id: z.string(), workspace: workspaceParam },
    },
    async ({ note_id, workspace }) => {
      const hit = await scope.locateNote(note_id, workspace)
      if (!hit) return text({ error: 'note_not_found' })
      return text(noteForLlm(hit.note, await listSubjects(hit.ws.id), hit.ws))
    },
  )

  server.registerTool(
    'list_subjects',
    {
      description:
        "List the user's subjects (their note categories, e.g. projects or life areas) with ids and names, " +
        'grouped by workspace. Use subject names when creating or filing notes so they land in the right place.',
      inputSchema: { workspace: workspaceParam },
    },
    async ({ workspace }) => {
      const targets = await scope.forRead(workspace)
      if (!targets) return workspaceNotFound(workspace)
      const out = await Promise.all(
        targets.map(async (ws) => ({
          workspace: ws.name,
          workspace_id: ws.id,
          subjects: (await listSubjects(ws.id)).map((s) => ({ id: s.id, name: s.name })),
        })),
      )
      return text(out)
    },
  )

  server.registerTool(
    'list_todo_lists',
    {
      description:
        "List the user's todo lists with open/done counts. Todo lists live in workspaces next to notes; " +
        'in a shared workspace every member sees and edits the same lists (a shared checklist). ' +
        'Covers every accessible workspace unless one is given.',
      inputSchema: { workspace: workspaceParam },
    },
    async ({ workspace }) => {
      const targets = await scope.forRead(workspace)
      if (!targets) return workspaceNotFound(workspace)
      const out = await Promise.all(
        targets.map(async (ws) =>
          Promise.all(
            (await listTodoLists(ws.id)).map(async (l) => listForLlm(l, await listItems(ws.id, l.id), ws)),
          ),
        ),
      )
      return text(out.flat())
    },
  )

  server.registerTool(
    'get_todo_list',
    {
      description:
        'Fetch a todo list with its items: title, done, assignee, due date, who added it. ' +
        'Open items come first (earliest due date first), then done ones. Also lists the workspace ' +
        'members who can be assignees.',
      inputSchema: {
        list: listParam,
        workspace: workspaceParam,
        include_done: z.boolean().optional().describe('Include completed items (default true)'),
      },
    },
    async ({ list, workspace, include_done }) => {
      const hit = await scope.locateList(list, workspace)
      if (!hit) return listNotFound(list)
      const all = await listItems(hit.ws.id, hit.list.id)
      const items = all.filter((i) => include_done !== false || !i.done)
      return text({
        ...listForLlm(hit.list, all, hit.ws),
        members: Object.values(hit.ws.members).map((m) => m.displayName || m.email),
        items: items.map((i) => itemForLlm(i, hit.list, hit.ws)),
      })
    },
  )

  if (canWrite) {
    server.registerTool(
      'create_todo_list',
      {
        description:
          'Create a new todo list. Goes to the default personal workspace unless a workspace is given; ' +
          'use a shared workspace for a list several people work on.',
        inputSchema: { name: z.string().min(1), workspace: workspaceParam },
      },
      async ({ name, workspace }) => {
        const ws = await scope.resolve(workspace)
        if (!ws) return workspaceNotFound(workspace)
        const list = await createTodoList(ws.id, actorFor(ctx, ws), name)
        return text(listForLlm(list, [], ws))
      },
    )

    server.registerTool(
      'add_todo_item',
      {
        description:
          'Add an item to a todo list. Optionally assign it to a workspace member (see get_todo_list members) ' +
          'and set a due date. The item records the user as "added by".',
        inputSchema: {
          list: listParam,
          title: z.string().min(1),
          assignee: assigneeParam,
          due_date: dueDateParam,
          workspace: workspaceParam,
        },
      },
      async ({ list, title, assignee, due_date, workspace }) => {
        const hit = await scope.locateList(list, workspace)
        if (!hit) return listNotFound(list)
        try {
          const item = await addItem(hit.ws.id, hit.list.id, actorFor(ctx, hit.ws), {
            title,
            assignee: assigneeFor(hit.ws, assignee),
            dueDate: due_date,
          })
          return text(itemForLlm(item, hit.list, hit.ws))
        } catch (err) {
          return text({ error: (err as Error).message })
        }
      },
    )

    server.registerTool(
      'update_todo_item',
      {
        description:
          'Update a todo item: mark it done or not done, change the title, assignee, or due date. ' +
          'Only pass the fields to change. Item ids come from get_todo_list; giving the list too is faster.',
        inputSchema: {
          item_id: z.string(),
          list: listParam.optional(),
          workspace: workspaceParam,
          title: z.string().min(1).optional(),
          done: z.boolean().optional(),
          assignee: assigneeParam,
          due_date: dueDateParam,
        },
      },
      async ({ item_id, list, workspace, title, done, assignee, due_date }) => {
        const hit = await scope.locateItem(item_id, list, workspace)
        if (!hit) return text({ error: 'todo_item_not_found' })
        try {
          const item = await updateItem(hit.ws.id, hit.list.id, item_id, actorFor(ctx, hit.ws), {
            title,
            done,
            assignee: assigneeFor(hit.ws, assignee),
            dueDate: due_date,
          })
          if (!item) return text({ error: 'todo_item_not_found' })
          return text(itemForLlm(item, hit.list, hit.ws))
        } catch (err) {
          return text({ error: (err as Error).message })
        }
      },
    )

    server.registerTool(
      'delete_todo_item',
      {
        description: 'Remove an item from a todo list. Prefer marking items done unless the user wants them gone.',
        inputSchema: { item_id: z.string(), list: listParam.optional(), workspace: workspaceParam },
      },
      async ({ item_id, list, workspace }) => {
        const hit = await scope.locateItem(item_id, list, workspace)
        if (!hit) return text({ error: 'todo_item_not_found' })
        await deleteItem(hit.ws.id, hit.list.id, item_id)
        return text({ deleted: item_id, list: hit.list.name })
      },
    )

    server.registerTool(
      'delete_todo_list',
      {
        description: 'Permanently delete a todo list and all its items. Only when the user clearly asks for it.',
        inputSchema: { list: listParam, workspace: workspaceParam },
      },
      async ({ list, workspace }) => {
        const hit = await scope.locateList(list, workspace)
        if (!hit) return listNotFound(list)
        await deleteTodoList(hit.ws.id, hit.list.id)
        return text({ deleted: hit.list.id, name: hit.list.name })
      },
    )

    server.registerTool(
      'create_note',
      {
        description:
          'Create a new note for the user. Body is markdown. Give it a clear title and file it ' +
          'under an existing subject when one fits (see list_subjects); a new subject name creates that subject. ' +
          'The note goes to the default personal workspace unless a workspace is given — use a shared ' +
          'workspace when the note belongs to that shared list. Use this to remember durable facts, ' +
          'decisions, and context the user will want later.',
        inputSchema: {
          title: z.string().min(1),
          body: z.string().describe('Markdown content'),
          subject: z.string().optional().describe('Subject name to file the note under'),
          tags: z.array(z.string()).optional().describe('Short lowercase tags'),
          workspace: workspaceParam,
        },
      },
      async ({ title, body, subject, tags, workspace }) => {
        const ws = await scope.resolve(workspace)
        if (!ws) return workspaceNotFound(workspace)
        const note = await createNote(ws.id, ctx.clientName, { title, body, subjectName: subject, tags })
        return text(noteForLlm(note, await listSubjects(ws.id), ws))
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
          workspace: workspaceParam,
        },
      },
      async ({ note_id, workspace, ...patch }) => {
        const hit = await scope.locateNote(note_id, workspace)
        if (!hit) return text({ error: 'note_not_found' })
        const note = await updateNote(hit.ws.id, ctx.clientName, note_id, {
          title: patch.title,
          body: patch.body,
          subjectName: patch.subject,
          tags: patch.tags,
        })
        if (!note) return text({ error: 'note_not_found' })
        return text(noteForLlm(note, await listSubjects(hit.ws.id), hit.ws))
      },
    )

    server.registerTool(
      'delete_note',
      {
        description: 'Permanently delete a note. Only do this when the user clearly asks for it.',
        inputSchema: { note_id: z.string(), workspace: workspaceParam },
      },
      async ({ note_id, workspace }) => {
        const hit = await scope.locateNote(note_id, workspace)
        if (!hit) return text({ error: 'note_not_found' })
        const ok = await deleteNote(hit.ws.id, note_id)
        return text(ok ? { deleted: note_id, workspace: hit.ws.name } : { error: 'note_not_found' })
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
