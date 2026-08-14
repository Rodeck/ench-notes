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
- Backend (MCP server, tag suggestions) lives on the VPS — not in this repo yet.

## Development

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

Data lives under `users/{uid}`: `notes`, `subjects`, and `mcpClients` subcollections. The `premium` flag on the user doc is server-managed (set it from the Firebase console); Firestore rules prevent clients from flipping it.

## Docs

- [App Visuals & MVP Design Brief](docs/design-brief.md)

## Status

Fresh start — project restarted from scratch on 2026-08-14. Planned work is tracked on the GitHub Project board.
