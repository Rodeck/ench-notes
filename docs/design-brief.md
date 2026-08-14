# ench-notes — App Visuals & MVP Design Brief

A web app for personal notes organized by **subject**, enriched with **tags**, and exposed to AI assistants through an **OAuth-protected MCP server**. This brief defines the visual direction, layout, required MVP screens, and the data each screen shows — enough to start designing without further decisions.

**Confirmed direction:**

| Decision | Choice |
|---|---|
| Style | Calm minimal (Notion/Linear-like) |
| Layout | Desktop-first three-pane, responsive |
| Note format | Markdown with rendered preview |
| Theming | Light + dark from day one, via design tokens |

---

## 1. Design principles

1. **Content-first.** The note is the hero. Chrome recedes: muted grays, 1px borders, no heavy shadows, no decorative panels.
2. **Fast capture.** Creating a note is never more than one click or one shortcut away from anywhere in the app.
3. **Calm density.** Comfortable line-height and whitespace. This is a thinking tool, not a dashboard — resist the urge to fill space.
4. **AI memory is visible.** The app doubles as an LLM's memory about the user. Surface provenance: a small badge marks notes created or edited by an assistant via MCP. The user should always know who wrote what.

---

## 2. Style / visual language

### Typography

- **UI + body font:** Inter (fallback: `system-ui` stack)
- **Note body:** ~16px, line-height 1.6
- **Note title:** 18–20px, semibold
- **UI labels / metadata:** 13–14px, text-secondary color
- **Code blocks in markdown:** JetBrains Mono (or `ui-monospace` stack), 14px, on surface background

### Color tokens

Define everything as tokens so light/dark is a swap, not a redesign.

| Token | Light | Dark |
|---|---|---|
| `bg` (page) | `#FFFFFF` | `#111110` |
| `surface` (cards, sidebar, inputs) | `#F8F8F7` | `#1B1B19` |
| `border` | `#E7E5E4` | `#2E2E2B` |
| `text-primary` | `#1C1917` | `#F5F5F4` |
| `text-secondary` | `#78716C` | `#A8A29E` |
| `accent` | desaturated indigo or teal — pick one during design, use sparingly | same hue, lightened for contrast on dark |

**Accent usage is deliberately narrow:** links, the active nav item, the primary button, focused input border. Everything else stays neutral.

**Tag colors:** a fixed palette of 6–8 muted hues (e.g. muted red, orange, yellow, green, teal, blue, purple, pink), auto-assigned per tag and stable across themes. Tags render as small chips: tinted background, darker text of the same hue, no border.

**Subject colors:** each subject gets a color dot from the same palette (user-pickable). The dot appears in the sidebar, in note list cards, and in the search palette.

### Shape, spacing, elevation

- **Radius:** 6–8px on everything (buttons, cards, inputs, chips slightly rounder at full radius)
- **Spacing:** 4px base scale (4 / 8 / 12 / 16 / 24 / 32)
- **Elevation:** 1px borders instead of shadows. A subtle shadow only on floating elements: popovers, modals, the ⌘K palette.

### Iconography & motion

- **Icons:** one outline set (Lucide), 16–20px, `text-secondary` color by default
- **Motion:** minimal — 120–160ms ease-out fades/slides on panel transitions, popovers, and modal entry. No scroll animations, no skeleton shimmer beyond a gentle pulse.

---

## 3. Layout skeleton (desktop)

Three panes: **Sidebar → Note list → Editor**.

```
┌────────────┬──────────────────┬──────────────────────────────────┐
│  SIDEBAR   │    NOTE LIST     │             EDITOR               │
│  ~240px    │     ~320px       │            flexible              │
│            │                  │                                  │
│ ◦ Logo     │ Subject name  ⇅  │  Title (inline editable)         │
│ [+ New]    │ ┌──────────────┐ │  ◦ Subject ▾   #tag #tag  [+]    │
│ [⌘K Search]│ │ Note title   │ │  ────────────────────────────    │
│            │ │ excerpt…     │ │                                  │
│ SUBJECTS   │ │ #tag #tag 2h │ │  Markdown editor / preview       │
│ ● All  24  │ ├──────────────┤ │                                  │
│ ● Proj X 9 │ │ Note title ✦ │ │                                  │
│ ● Life   7 │ │ excerpt…     │ │                                  │
│ + Add      │ │ #tag     1d  │ │                                  │
│            │ └──────────────┘ │                                  │
│ TAGS       │                  │                                  │
│ #idea #dev │                  │  created · updated        [⋯]    │
│ ─────────  │                  │                                  │
│ ◦ Avatar ▸ │                  │                                  │
└────────────┴──────────────────┴──────────────────────────────────┘
                                     ✦ = created via MCP badge
```

**Sidebar contents (top to bottom):**
- App logo / wordmark
- **＋ New note** — primary button, always visible
- **Search** trigger showing the `⌘K` shortcut hint
- **Subjects** section: "All notes" plus each subject as `color dot · name · note count`; "＋ Add subject" at the end
- **Tags** section: top ~10 tags as clickable chips (filters the list)
- Footer: user avatar + name → menu with Settings and Sign out

**Responsive behavior:**
- **< 1024px:** sidebar collapses behind a hamburger; two panes remain (list + editor)
- **< 768px:** single-pane stack — list and editor are separate views with back navigation; floating **＋** button bottom-right for capture

---

## 4. MVP screens & the data each shows

### 4.1 Login

Centered card on the page background.

- Logo + wordmark
- Tagline: *"Notes that your AI remembers."*
- **Continue with Google** (primary, Firebase Auth)
- Email + password fields with sign in / sign up toggle
- Inline error state for failed auth (red text under the form, not a toast)
- Theme follows system preference (no toggle needed pre-login)

### 4.2 Main workspace (note list + editor)

The core screen — the three-pane layout above.

**Note list card shows:**
- Title (single line, truncated)
- Body excerpt (1–2 lines, plain-text render of the markdown)
- Subject color dot + name — only when viewing "All notes" or a tag filter
- Up to 3 tag chips, then a `+N` overflow chip
- Relative updated time ("2h", "3d")
- **MCP-origin badge** (small ✦ or bot icon) if the note was last touched via MCP
- Active/selected card: `surface` background + accent left edge or accent title
- Sort control in the list header: updated ↓ (default) / created ↓

**Editor pane shows:**
- Title — large, inline editable, placeholder "Untitled"
- Metadata row: subject picker (dropdown with color dots) · tag chips with inline "＋ add tag" (autocomplete against existing tags)
- Markdown editor with **Edit / Preview** toggle; at ≥1440px optionally side-by-side split
- Footer: created + updated timestamps (absolute on hover), autosave indicator ("Saved")
- Overflow menu `⋯`: delete (opens confirm modal), copy link
- **Premium — "✨ Suggest tags":** button in the tag row; returns LLM-suggested tags as dashed-outline chips the user can accept (click) or dismiss (x). Free users see the button disabled with a small "Premium" badge and a tooltip.

### 4.3 Search (⌘K palette)

Modal command palette over any screen (also triggered from the sidebar).

- Query input, autofocused
- Filter chips below the input: by subject, by tag
- Results: note title + highlighted matching snippet + subject dot/name + updated time
- Full keyboard navigation (↑↓ + Enter), Esc to close
- Doubles as a quick-switcher: typing a subject name offers "Go to subject" results
- Empty state: "No notes match — press Enter to create '<query>'" (capture from search)

### 4.4 Subject management

Lightweight — no dedicated page.

- **Create:** "＋ Add subject" in the sidebar → inline input + color picker (the fixed palette dots)
- **Edit / delete:** right-click or `⋯` on a sidebar subject → rename, change color, delete
- **Delete modal:** asks what happens to the subject's notes — *Move to another subject* (picker) or *Delete notes too* (destructive, red confirm)
- Data per subject: name, color, note count

### 4.5 Settings

Single page (rendered in the editor pane area or as a full-width page), sectioned:

| Section | Contents |
|---|---|
| **Profile** | Avatar, display name, email, Sign out |
| **Appearance** | Theme: System / Light / Dark (segmented control) |
| **Premium** | Current plan badge ("Free" / "Premium") — flag display only, no purchase flow |
| **Connections (MCP)** | See below — this is the differentiator screen |

**Connections (MCP) section:**
- Intro line: "Connect your AI assistant to read and write your notes."
- MCP endpoint URL in a copyable code field + short "How to connect Claude" hint (link to docs)
- Table/list of authorized clients, each showing: client name (e.g. "Claude Desktop"), granted scopes as chips (`read`, `write`), connected date, last used, and a **Revoke** button (confirm inline, turns red)
- Empty state: illustration + "No assistants connected yet" + copy-endpoint CTA

### 4.6 States (design these explicitly)

- **First-run empty state** (workspace, no notes): friendly minimal illustration, "Create your first note" primary button, secondary hint "…or connect your AI assistant" linking to Settings → Connections
- **Empty subject:** "No notes in <subject> yet" + New note button
- **Empty search:** see 4.3 (create-from-query)
- **Loading:** skeleton rows in the note list, skeleton title + lines in the editor; gentle pulse, no shimmer
- **Errors:** toast (bottom-right) with retry action for failed saves/loads; inline red text for form validation
- **Destructive confirms:** modal with the item name, neutral cancel + red confirm

---

## 5. Data model surfaced in the UI (reference)

What the design needs fields for — the visual contract with the backend:

- **Note:** title, markdown body, subject (one), tags (many), created at, updated at, origin of last edit (`user` | `mcp`), origin client name (for the badge tooltip: "Edited by Claude, 2h ago")
- **Subject:** name, color, note count
- **Tag:** name, auto-assigned color; usage count (for the sidebar top-tags list)
- **User:** name, email, avatar, premium flag, theme preference
- **MCP client (connection):** client name, scopes, connected at, last used at

---

## 6. Out of scope for MVP visuals

Mobile native apps · payments/checkout · admin views · analytics dashboards · collaborative/shared notes · attachments & images (markdown text only) · notifications · offline mode.
