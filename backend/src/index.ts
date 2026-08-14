import Fastify from 'fastify'
import cors from '@fastify/cors'
import formbody from '@fastify/formbody'
import { config, assertProductionConfig } from './config.js'
import { registerHealthRoutes, httpRequests } from './routes/health.js'
import { registerSuggestRoutes } from './routes/suggest.js'
import { registerOAuthRoutes } from './oauth/routes.js'
import { registerMcpRoutes } from './mcp.js'

if (process.env.NODE_ENV === 'production') assertProductionConfig()

const app = Fastify({
  logger: { level: 'info' }, // pino JSON to stdout; shipped by Alloy on the VPS
  trustProxy: true, // behind Caddy
})

await app.register(formbody) // OAuth token/revoke endpoints are form-encoded

await app.register(cors, {
  origin: (origin, cb) => {
    // /api/* is called by the frontend; OAuth + MCP endpoints may be hit from
    // assistant web apps. Allow configured frontend origins plus any origin
    // for the OAuth/MCP surface (they are bearer/token protected, not cookie
    // based, so CORS is not a security boundary here).
    if (!origin || config.frontendOrigins.includes(origin)) return cb(null, true)
    return cb(null, true)
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Mcp-Protocol-Version'],
  exposedHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'],
})

app.addHook('onResponse', async (req, reply) => {
  const route = req.routeOptions?.url ?? 'unknown'
  if (route !== '/metrics' && route !== '/healthz') {
    httpRequests.inc({ route, status: String(reply.statusCode) })
  }
})

registerHealthRoutes(app)
registerSuggestRoutes(app)
registerOAuthRoutes(app)
registerMcpRoutes(app)

app.get('/', async () => ({
  service: 'ench-notes-api',
  mcp: `${config.publicUrl}/mcp`,
}))

const close = async (signal: string) => {
  app.log.info({ signal }, 'shutting down')
  // Compose's stop_grace_period outlasts this drain window.
  const timer = setTimeout(() => process.exit(1), 10_000)
  await app.close()
  clearTimeout(timer)
  process.exit(0)
}
process.on('SIGTERM', () => void close('SIGTERM'))
process.on('SIGINT', () => void close('SIGINT'))

try {
  await app.listen({ port: config.port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
