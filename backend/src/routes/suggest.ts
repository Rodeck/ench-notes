import type { FastifyInstance } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'
import { requireFirebaseUser } from '../auth.js'
import { db } from '../firebase.js'
import { config } from '../config.js'

/* Premium tag suggestions: the editor posts the note content and gets back
   a handful of short tags from Claude. Gated on users/{uid}.premium. */

const anthropic = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey }) : null

const TAG_SCHEMA = {
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Up to 5 short lowercase tags',
    },
  },
  required: ['tags'],
  additionalProperties: false,
} as const

export function registerSuggestRoutes(app: FastifyInstance) {
  app.post('/api/suggest-tags', async (req, reply) => {
    const user = await requireFirebaseUser(req, reply)
    if (!user) return

    const profile = await db().collection('users').doc(user.uid).get()
    if (!profile.exists || profile.data()!.premium !== true) {
      return reply.code(403).send({ error: 'premium_required' })
    }
    if (!anthropic) {
      return reply.code(503).send({ error: 'suggestions_unavailable' })
    }

    const body = (req.body ?? {}) as { title?: string; body?: string; existingTags?: string[] }
    const title = (body.title ?? '').slice(0, 500)
    const content = (body.body ?? '').slice(0, 20_000)
    const existing = (body.existingTags ?? []).slice(0, 20)
    if (!title && !content) return reply.code(400).send({ error: 'empty_note' })

    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 300,
      output_config: {
        effort: 'low', // simple extraction; latency-sensitive button click
        format: { type: 'json_schema', schema: TAG_SCHEMA as unknown as Record<string, unknown> },
      },
      system:
        'You suggest tags for personal notes. Suggest at most 5 short, general, reusable ' +
        'lowercase tags (single words or short kebab-case) that capture the topics of the note. ' +
        'Do not repeat tags the note already has. Fewer, better tags beat many mediocre ones.',
      messages: [
        {
          role: 'user',
          content: `Existing tags: ${existing.join(', ') || '(none)'}\n\nTitle: ${title}\n\n${content}`,
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return reply.send({ tags: [] })
    }
    const textBlock = response.content.find((b) => b.type === 'text')
    let tags: string[] = []
    try {
      tags = (JSON.parse(textBlock?.type === 'text' ? textBlock.text : '{}').tags ?? []) as string[]
    } catch {
      tags = []
    }
    tags = tags
      .map((t) => t.trim().replace(/^#/, '').toLowerCase())
      .filter((t) => t && !existing.includes(t))
      .slice(0, 5)
    return reply.send({ tags })
  })
}
