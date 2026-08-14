import { useEffect, useMemo, useRef, useState } from 'react'
import type { Note, Subject } from '../data/types'
import { relTime } from '../data/time'

interface Props {
  notes: Note[]
  subjects: Subject[]
  onClose: () => void
  onOpenNote: (id: string) => void
  onCreate: (title: string) => void
}

export function SearchPalette({ notes, subjects, onClose, onOpenNote, onCreate }: Props) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return notes.slice(0, 8)
    return notes
      .filter(
        (n) =>
          n.title.toLowerCase().includes(needle) ||
          n.body.toLowerCase().includes(needle) ||
          n.tags.some((t) => t.includes(needle)),
      )
      .slice(0, 12)
  }, [q, notes])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => setCursor(0), [q])

  function snippet(n: Note): string {
    const needle = q.trim().toLowerCase()
    if (needle) {
      const i = n.body.toLowerCase().indexOf(needle)
      if (i >= 0) {
        return (i > 30 ? '…' : '') + n.body.slice(Math.max(0, i - 30), i + 90).replace(/\n/g, ' ')
      }
    }
    return n.body.replace(/\n/g, ' ').slice(0, 90)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, results.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (results.length > 0) onOpenNote(results[cursor].id)
      else if (q.trim()) onCreate(q.trim())
    }
  }

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search notes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        {results.length > 0 ? (
          <div className="palette-list">
            {results.map((n, i) => {
              const subj = n.subjectId ? subjectById.get(n.subjectId) : undefined
              return (
                <button
                  key={n.id}
                  className={`palette-item${i === cursor ? ' on' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => onOpenNote(n.id)}
                >
                  {subj && <span className="dot8" style={{ background: subj.color, flex: 'none' }} />}
                  <span className="t">
                    {n.title || 'Untitled'}
                    <span className="snip">{snippet(n)}</span>
                  </span>
                  <span className="notecard-time">{relTime(n.updatedAt)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="palette-empty">
            {q.trim()
              ? `No notes match — press Enter to create “${q.trim()}”`
              : 'No notes yet.'}
          </div>
        )}
      </div>
    </div>
  )
}
