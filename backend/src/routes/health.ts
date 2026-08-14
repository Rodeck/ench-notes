import type { FastifyInstance } from 'fastify'
import { Registry, collectDefaultMetrics, Counter } from 'prom-client'

export const registry = new Registry()
collectDefaultMetrics({ register: registry })

export const httpRequests = new Counter({
  name: 'ench_http_requests_total',
  help: 'HTTP requests by route and status',
  labelNames: ['route', 'status'],
  registers: [registry],
})

export function registerHealthRoutes(app: FastifyInstance) {
  app.get('/healthz', async () => ({ ok: true }))

  // Scraped over the compose network only — Caddy 404s /metrics publicly.
  app.get('/metrics', async (_req, reply) => {
    reply.type(registry.contentType)
    return registry.metrics()
  })
}
