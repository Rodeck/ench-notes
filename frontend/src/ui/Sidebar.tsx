import { useMemo, useState } from 'react'
import type { Note, Subject, TodoList, TodoListKind, Workspace } from '../data/types'
import { ALL_NOTES_COLOR, SUBJECT_COLORS, initials, tagHue } from '../data/palette'
import { createSubject, createTodoList } from '../data/store'
import { useAuth } from '../auth'
import { ChevronRightIcon, ListIcon, PlusIcon, SearchIcon, TableIcon } from './icons'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

interface Props {
  uid: string
  workspace: Workspace
  workspaces: Workspace[]
  onSelectWorkspace: (id: string) => void
  onCreateWorkspace: () => void
  onManageWorkspace: () => void
  subjects: Subject[]
  notes: Note[]
  todoLists: TodoList[]
  /** Open-item count per list id. */
  todoCounts: Map<string, number>
  selectedList: string | null
  onSelectList: (id: string) => void
  selectedSubject: string // 'all' or subject id; ignored while a list is open
  onSelectSubject: (id: string) => void
  tagFilter: string | null
  onTagFilter: (tag: string | null) => void
  onNewNote: () => void
  onOpenSearch: () => void
  onOpenSettings: () => void
}

export function Sidebar({
  uid,
  workspace,
  workspaces,
  onSelectWorkspace,
  onCreateWorkspace,
  onManageWorkspace,
  subjects,
  notes,
  todoLists,
  todoCounts,
  selectedList,
  onSelectList,
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
  const [addingList, setAddingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListKind, setNewListKind] = useState<TodoListKind>('list')

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

  async function submitList() {
    const name = newListName.trim()
    if (!name) return
    const id = await createTodoList(workspace.id, name, newListKind)
    setNewListName('')
    setNewListKind('list')
    setAddingList(false)
    onSelectList(id)
  }

  async function submitSubject() {
    const name = newName.trim()
    if (!name) return
    await createSubject(workspace.id, name, newColor)
    setNewName('')
    setNewColor(SUBJECT_COLORS[0])
    setAdding(false)
  }

  return (
    <aside className="sidebar">
      <WorkspaceSwitcher
        uid={uid}
        workspaces={workspaces}
        current={workspace}
        onSelect={onSelectWorkspace}
        onCreate={onCreateWorkspace}
        onManage={onManageWorkspace}
      />
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
          className={`subj-btn${!selectedList && selectedSubject === 'all' ? ' on' : ''}`}
          onClick={() => onSelectSubject('all')}
        >
          <span className="subj-dot" style={{ background: ALL_NOTES_COLOR }} />
          <span className="subj-name">All notes</span>
          <span className="subj-count">{notes.length}</span>
        </button>
        {subjects.map((s) => (
          <button
            key={s.id}
            className={`subj-btn${!selectedList && selectedSubject === s.id ? ' on' : ''}`}
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

      <div className="side-group">
        <h6 className="side-h6">Lists</h6>
        {todoLists.map((l) => (
          <button
            key={l.id}
            className={`subj-btn${selectedList === l.id ? ' on' : ''}`}
            onClick={() => onSelectList(l.id)}
          >
            {l.kind === 'table' ? <TableIcon /> : <ListIcon />}
            <span className="subj-name">{l.name}</span>
            <span className="subj-count">{todoCounts.get(l.id) ?? 0}</span>
          </button>
        ))}
        {addingList ? (
          <div className="side-addform">
            <input
              className="input"
              autoFocus
              placeholder="List name"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitList()
                if (e.key === 'Escape') setAddingList(false)
              }}
            />
            <div className="seg seg-sm" role="radiogroup" aria-label="List kind">
              {(['list', 'table'] as const).map((k) => (
                <label key={k} className="seg-opt">
                  <input type="radio" name="list-kind" checked={newListKind === k} onChange={() => setNewListKind(k)} />
                  {k === 'list' ? 'List' : 'Table'}
                </label>
              ))}
            </div>
            <span className="side-hint">
              {newListKind === 'list'
                ? 'A simple checklist.'
                : 'Columns with filters and sorting, shared with everyone.'}
            </span>
          </div>
        ) : (
          <button className="side-add" onClick={() => setAddingList(true)}>
            <PlusIcon size={14} />
            Add list
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
