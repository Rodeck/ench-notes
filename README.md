# ench-notes

Notes that your AI remembers.

A web app for personal notes organized by **subject** (projects, lifestyle, …), enriched with **tags** (user-added, LLM-suggested for premium), and exposed to AI assistants through an **OAuth-protected MCP server** — so Claude and other tools can read, add, modify, delete, and search your notes, giving the LLM persistent memory about you and your work.

## MVP scope

- Web app: notes with subjects, tags, markdown editing, search
- Firebase Auth (Google + email/password)
- MCP server with OAuth for AI assistant connections
- Premium flag gating LLM tag suggestions (no purchases)
- Frontend on Firebase Hosting, backend in Docker on VPS

Deferred: mobile apps, payments, Grafana metrics/logs (design keeps them easy to add).

## Structure

- `frontend/` — React + Vite + TypeScript SPA using the **Organic** design system (imported from the Claude Design project). Talks to Firebase Auth (Google + email/password) and Firestore directly.
- `firebase.json`, `firestore.rules`, `firestore.indexes.json` — Firebase Hosting + Firestore config at the repo root.
- `backend/` — Fastify + TypeScript API and MCP server (OAuth 2.1, tag suggestions). Deployed to the openclaw VPS at `https://ench-api.duckdns.org`; see [backend/README.md](backend/README.md).

## Development

### Local stack (one command)

```bash
(cd frontend && npm install) && (cd backend && npm install)   # once
npm run dev
```

`npm run dev` (root) starts the Firebase **Auth + Firestore emulators**, the
backend, and the frontend, all wired to each other — nothing touches the real
Firebase project. Needs Java (for the emulators) and the Firebase CLI
(`npm i -g firebase-tools`). The first run seeds test data; emulator data is
kept in `.emulator-data/` between runs.

| What | Where |
|---|---|
| App | http://localhost:5173 |
| Backend + MCP | http://127.0.0.1:8787 (`/mcp`) |
| Emulator UI (browse data) | http://127.0.0.1:4000 |

Sign in with Google (the emulator shows a fake account picker — any name works)
or with the seeded accounts `alice@local.test` / `bob@local.test`, password
`password123`. Alice owns the shared workspace "Family shopping" with Bob in it.
Open the app in two browser profiles (or a private window) to try sharing live.
`npm run seed` re-seeds a running stack.

MCP locally works without OAuth or HTTPS: the seed creates a long-lived bearer
token for Alice, so any client can connect with a static header:

```bash
claude mcp add --transport http ench-local http://127.0.0.1:8787/mcp   --header "Authorization: Bearer enat_local_alice"
```

The real OAuth flow also works locally (consent page signs in against the Auth
emulator) for clients that accept plain `http://` issuers.

### Tests

```bash
npm test             # Firestore rules + backend/MCP end-to-end, under the emulators
npm run test:rules   # rules only (frontend/tests/firestore-rules.test.mjs)
npm run test:e2e     # backend/tests/e2e.test.ts: workspaces, sharing, MCP over HTTP
```

Tests use their own emulator project ids, so they never see or touch `npm run dev` data.

On Windows the emulator's Java process occasionally survives a run and keeps
port 8080; `npm run dev` tells you when that happens and prints the command
to free it.

### Frontend against the real project

```bash
cd frontend
cp .env.example .env.local   # fill in your Firebase web app keys
npm install
npm run dev
```

Firebase setup (once per environment):

1. Create a Firebase project, add a **web app**, and copy its config into `.env.local`.
2. Enable **Authentication → Google** and **Email/Password** sign-in providers.
3. Create a **Firestore** database and deploy the rules: `firebase deploy --only firestore:rules`.
4. Hosting deploy: `npm run build` in `frontend/`, then `firebase deploy --only hosting`.

Notes and subjects live in **workspaces**: `workspaces/{wsId}` holds `name`, `ownerId`, `memberIds`, and a `members` map, with `notes` and `subjects` subcollections. Every user gets a default workspace whose id is their uid, created on first sign-in. The owner can share a workspace with other accounts by email; every member can add, edit, and delete any note in it, in the app and through MCP (tools take an optional `workspace`, and `list_workspaces` shows what the user can reach). Membership changes go through the backend (`/api/workspaces/*`); the app creates and renames workspaces directly under Firestore rules.

`users/{uid}` keeps the profile (`premium` is server-managed — set it from the Firebase console; rules prevent clients from flipping it) and the `mcpClients` subcollection. Data written before workspaces existed lives under `users/{uid}/notes` and `subjects`; copy it into the default workspaces once with `npm run migrate:workspaces -- --apply` in `backend/` (dry run without `--apply`).

## Docs

- [App Visuals & MVP Design Brief](docs/design-brief.md)

## Status

Fresh start — project restarted from scratch on 2026-08-14. Planned work is tracked on the GitHub Project board.
