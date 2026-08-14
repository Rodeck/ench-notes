import { useMemo, useState } from 'react'
import type { Note, Subject } from '../data/types'
import { ALL_NOTES_COLOR, SUBJECT_COLORS, initials, tagHue } from '../data/palette'
import { createSubject } from '../data/store'
import { useAuth } from '../auth'
import { ChevronRightIcon, PlusIcon, SearchIcon } from './icons'

interface Props {
  uid: string
  subjects: Subject[]
  notes: Note[]
  selectedSubject: string // 'all' or subject id
  onSelectSubject: (id: string) => void
  tagFilter: string | null
  onTagFilter: (tag: string | null) => void
  onNewNote: () => void
  onOpenSearch: () => void
  onOpenSettings: () => void
}

export function Sidebar({
  uid,
  subjects,
  notes,
  selectedSubject,
  onSelectSubject,
  tagFilter,
  onTagFilter,
  onNewNote,
  onOpenSearch,
  onOpenSettings,
}: Props) {
  const { profile } = useAuth()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(SUBJECT_COLORS[0])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of notes) {
      const k = n.subjectId ?? '_none'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [notes])

  const topTags = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of notes) for (const t of n.tags) m.set(t, (m.get(t) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t)
  }, [notes])

  async function submitSubject() {
    const name = newName.trim()
    if (!name) return
    await createSubject(uid, name, newColor)
    setNewName('')
    setNewColor(SUBJECT_COLORS[0])
    setAdding(false)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-actions">
        <button className="btn btn-primary btn-block btn-new" onClick={onNewNote}>
          <PlusIcon />
          New note
        </button>
        <button className="side-search" onClick={onOpenSearch}>
          <SearchIcon />
          Search
          <span className="kbd">⌘K</span>
        </button>
      </div>

      <div className="side-group">
        <h6 className="side-h6">Subjects</h6>
        <button
          className={`subj-btn${selectedSubject === 'all' ? ' on' : ''}`}
          onClick={() => onSelectSubject('all')}
        >
          <span className="subj-dot" style={{ background: ALL_NOTES_COLOR }} />
          <span className="subj-name">All notes</span>
          <span className="subj-count">{notes.length}</span>
        </button>
        {subjects.map((s) => (
          <button
            key={s.id}
            className={`subj-btn${selectedSubject === s.id ? ' on' : ''}`}
            onClick={() => onSelectSubject(s.id)}
          >
            <span className="subj-dot" style={{ background: s.color }} />
            <span className="subj-name">{s.name}</span>
            <span className="subj-count">{counts.get(s.id) ?? 0}</span>
          </button>
        ))}
        {adding ? (
          <div className="side-addform">
            <input
              className="input"
              autoFocus
              placeholder="Subject name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitSubject()
                if (e.key === 'Escape') setAdding(false)
              }}
            />
            <div className="color-dots">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c}
                  className={`color-dot${newColor === c ? ' on' : ''}`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
          </div>
        ) : (
          <button className="side-add" onClick={() => setAdding(true)}>
            <PlusIcon size={14} />
            Add subject
          </button>
        )}
      </div>

      {topTags.length > 0 && (
        <div>
          <h6 className="side-h6" style={{ marginBottom: 8 }}>
            Tags
          </h6>
          <div className="tagwrap">
            {topTags.map((t) => {
              const hue = tagHue(t)
              return (
                <button
                  key={t}
                  className={`tag${tagFilter === t ? ' on' : ''}`}
                  style={{ background: hue.bg, color: hue.fg, border: 0, cursor: 'pointer' }}
                  onClick={() => onTagFilter(tagFilter === t ? null : t)}
                >
                  #{t}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="side-user-wrap">
        <button className="side-user" onClick={onOpenSettings}>
          <span className="avatar">{initials(profile?.displayName ?? '?')}</span>
          <span className="side-user-txt">
            <span className="side-user-name">{profile?.displayName}</span>
            <span className="side-user-mail">{profile?.email}</span>
          </span>
          <ChevronRightIcon />
        </button>
      </div>
    </aside>
  )
}
