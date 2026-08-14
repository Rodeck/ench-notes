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

## Docs

- [App Visuals & MVP Design Brief](docs/design-brief.md)

## Status

Fresh start — project restarted from scratch on 2026-08-14. Planned work is tracked on the GitHub Project board.
