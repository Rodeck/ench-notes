# ench-notes backend

Fastify + TypeScript service: `/healthz`, `/metrics`, `POST /api/suggest-tags`
(premium, Claude), workspace sharing (`POST /api/workspaces/:id/members`,
`DELETE /api/workspaces/:id/members/:uid`, `DELETE /api/workspaces/:id` —
Firebase ID token auth), an OAuth 2.1 authorization server (`/oauth/*`,
`/.well-known/*`), and the stateless Streamable-HTTP MCP server at `POST /mcp`.

MCP tools resolve every workspace reference against the caller's own
memberships (`workspaces` where `memberIds` contains the uid), so a token
only ever reaches workspaces its user belongs to. `list_workspaces` lists
them; reads default to all of them, writes to the personal one. Notes
(`search_notes`, `get_note`, `create_note`, …) and todo lists
(`list_todo_lists`, `get_todo_list`, `add_todo_item`, `update_todo_item`, …)
follow the same rules; todo lists and items are matched by id or name, and
assignees by member display name or email. Table lists (`kind: "table"`)
carry a `shared_view` (the sort and filters every member sees in the app);
API results are never filtered by it.

## Local development

`npm run dev` at the repo root runs this service against the Firebase
emulators with `tsx watch` (see the root README). `npm run test:e2e` at the
root runs `tests/e2e.test.ts`, which boots the app on a spare port and drives
the workspace layer and the MCP endpoint over HTTP with a seeded bearer token.
`scripts/seed-local.ts` creates the local test users and refuses to run
without the emulator env vars.

## Migrating pre-workspace data

`npm run migrate:workspaces` (dry run) / `npm run migrate:workspaces -- --apply`
copies `users/{uid}/{notes,subjects}` into `workspaces/{uid}/…` and creates
the workspace doc. Idempotent; leaves the legacy docs in place. Needs
`GOOGLE_APPLICATION_CREDENTIALS` for the project.

## Where it runs

`https://ench-api.duckdns.org` on the **openclaw VPS** (`ssh openclaw`,
`ubuntu@51.38.135.211`). Nothing there is shared with any other project.

| Piece | Location on the VPS |
|---|---|
| Node service | `systemd` unit `ench-api`, runs as user `ench`, listens on `127.0.0.1:8787` |
| App files | `/opt/ench/app` (`dist/`, `package*.json`, `node_modules/`) |
| Secrets | `/opt/ench/.env`, `/opt/ench/secrets/service-account.json` — hand-managed, never in git |
| Reverse proxy | nginx site `/etc/nginx/sites-available/ench-api`, TLS by certbot (auto-renews) |

The unit and nginx site are mirrored in `deploy/` for reference; the live
copies on the VPS are the ones that count.

History: until 2026-09-06 this ran in Docker on the hirdfit VPS behind that
project's Caddy. On 2026-09-02 that box put its own API behind Cloudflare and
firewalled the origin to Cloudflare's ranges, which silently dropped every
direct hostname — DuckDNS names cannot be proxied — so the ench endpoint went
dark. It was moved here so the two projects no longer share a proxy, a
firewall policy, or a Caddyfile that the other project's deploy overwrites.

## Deploy

```sh
cd backend
bash deploy/deploy.sh
```

Builds locally, ships `dist/` + manifests, runs `npm ci --omit=dev` on the VPS,
restarts the unit, then verifies from the outside: health, OAuth issuer, the
`401` MCP handshake, and that `/metrics` is not public. A failed check exits
non-zero — read it before assuming the deploy is fine.

Logs: `ssh openclaw sudo journalctl -u ench-api -f`.

## Environment

`.env.example` lists every key. On the VPS the file is `/opt/ench/.env`; the
unit adds `NODE_ENV=production`, `HOST=127.0.0.1` (bind loopback only — the
box has no firewall, nginx is the only public listener) and
`GOOGLE_APPLICATION_CREDENTIALS`.

`PUBLIC_URL` is the OAuth issuer and the MCP resource identifier. Changing it
invalidates every connected client's registration, so treat it as permanent.

## Connecting an assistant

Claude.ai → Settings → Connectors → *Add custom connector* →
`https://ench-api.duckdns.org/mcp`, or
`claude mcp add --transport http enchnotes https://ench-api.duckdns.org/mcp`.
The consent page signs in with Google via Firebase web auth on the API origin,
so `ench-api.duckdns.org` must stay in the Firebase project's authorized
domains.

## Local development

```sh
cp .env.example .env   # fill in keys; GOOGLE_APPLICATION_CREDENTIALS for Firestore
npm install
npm run dev            # tsx watch, http://localhost:8787
```

The `Dockerfile` still builds a runnable image for local or container use;
production no longer uses it.
