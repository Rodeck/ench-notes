import type { Note, Subject } from '../data/types'
import { relTime } from '../data/time'
import { tagHue } from '../data/palette'
import { SortDownIcon, SparkIcon } from './icons'

interface Props {
  title: string
  notes: Note[]
  subjects: Subject[]
  selectedNoteId: string | null
  showSubject: boolean
  sort: 'updatedAt' | 'createdAt'
  onToggleSort: () => void
  onSelect: (id: string) => void
  onNewNote: () => void
}

/** First non-heading, non-code text of the body as a plain excerpt. */
function excerpt(body: string): string {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('```'))
    .join(' ')
    .replace(/[*_`>[\]]/g, '')
    .slice(0, 200)
}

export function NoteList({
  title,
  notes,
  subjects,
  selectedNoteId,
  showSubject,
  sort,
  onToggleSort,
  onSelect,
  onNewNote,
}: Props) {
  const subjectById = new Map(subjects.map((s) => [s.id, s]))

  return (
    <section className="notelist">
      <header className="notelist-head">
        <h4>{title}</h4>
        <span className="notelist-count">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </span>
        <button className="sortbtn" onClick={onToggleSort}>
          {sort === 'updatedAt' ? 'Updated' : 'Created'}
          <SortDownIcon />
        </button>
      </header>
      {notes.length === 0 ? (
        <div className="empty">
          <div className="blob">e</div>
          <h3>No notes here yet</h3>
          <p style={{ margin: 0, fontSize: 14 }}>
            {title === 'All notes'
              ? 'Create your first note — or connect your AI assistant in Settings.'
              : `Nothing filed under ${title} so far.`}
          </p>
          <button className="btn btn-primary" onClick={onNewNote}>
            New note
          </button>
        </div>
      ) : (
        <div className="notes-scroll">
          {notes.map((n) => {
            const subj = n.subjectId ? subjectById.get(n.subjectId) : undefined
            return (
              <button
                key={n.id}
                className={`notecard${n.id === selectedNoteId ? ' sel' : ''}`}
                onClick={() => onSelect(n.id)}
              >
                <span className="notecard-top">
                  <span className="notecard-title">{n.title || 'Untitled'}</span>
                  {n.origin === 'mcp' && (
                    <span
                      className="mcp-chip"
                      title={n.originClient ? `Edited by ${n.originClient}` : 'Edited via MCP'}
                    >
                      <SparkIcon />
                      MCP
                    </span>
                  )}
                </span>
                {excerpt(n.body) && <span className="notecard-x">{excerpt(n.body)}</span>}
                <span className="notecard-meta">
                  {showSubject && subj && (
                    <span className="subj-mini">
                      <span className="dot7" style={{ background: subj.color }} />
                      {subj.name}
                    </span>
                  )}
                  {n.tags.slice(0, 3).map((t) => {
                    const hue = tagHue(t)
                    return (
                      <span key={t} className="tag" style={{ background: hue.bg, color: hue.fg }}>
                        #{t}
                      </span>
                    )
                  })}
                  {n.tags.length > 3 && (
                    <span className="tag tag-neutral">+{n.tags.length - 3}</span>
                  )}
                  <span className="notecard-time">
                    {relTime(sort === 'updatedAt' ? n.updatedAt : n.createdAt)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
