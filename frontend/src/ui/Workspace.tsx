import { useEffect, useMemo, useState } from 'react'
import { useNotes, useSubjects, createNote } from '../data/store'
import { Sidebar } from './Sidebar'
import { NoteList } from './NoteList'
import { Editor } from './Editor'
import { SearchPalette } from './SearchPalette'

interface Props {
  uid: string
  onOpenSettings: () => void
  onToast: (msg: string) => void
}

export function Workspace({ uid, onOpenSettings, onToast }: Props) {
  const [sort, setSort] = useState<'updatedAt' | 'createdAt'>('updatedAt')
  const notes = useNotes(uid, sort)
  const subjects = useSubjects(uid)
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  const visible = useMemo(() => {
    if (!notes) return []
    return notes.filter(
      (n) =>
        (subjectFilter === 'all' || n.subjectId === subjectFilter) &&
        (!tagFilter || n.tags.includes(tagFilter)),
    )
  }, [notes, subjectFilter, tagFilter])

  // Keep a valid selection as filters and data change.
  useEffect(() => {
    if (visible.length === 0) {
      setSelectedNoteId(null)
      return
    }
    if (!selectedNoteId || !visible.some((n) => n.id === selectedNoteId)) {
      setSelectedNoteId(visible[0].id)
    }
  }, [visible, selectedNoteId])

  // ⌘K / Ctrl+K opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function newNote(title = '') {
    const subjectId = subjectFilter === 'all' ? null : subjectFilter
    const id = await createNote(uid, subjectId)
    if (title) {
      const { updateNote } = await import('../data/store')
      await updateNote(uid, id, { title })
    }
    setSelectedNoteId(id)
  }

  const subjectName =
    subjectFilter === 'all'
      ? 'All notes'
      : (subjects?.find((s) => s.id === subjectFilter)?.name ?? 'All notes')
  const listTitle = tagFilter ? `#${tagFilter}` : subjectName

  const openNote = visible.find((n) => n.id === selectedNoteId) ?? null
  const loading = notes === null || subjects === null

  return (
    <div className={`workspace${openNote ? ' show-editor' : ''}`}>
      <Sidebar
        uid={uid}
        subjects={subjects ?? []}
        notes={notes ?? []}
        selectedSubject={subjectFilter}
        onSelectSubject={(id) => {
          setSubjectFilter(id)
          setTagFilter(null)
        }}
        tagFilter={tagFilter}
        onTagFilter={setTagFilter}
        onNewNote={() => void newNote()}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={onOpenSettings}
      />
      {loading ? (
        <section className="notelist">
          <div className="empty">
            <p style={{ margin: 0 }}>Loading your notes…</p>
          </div>
        </section>
      ) : (
        <NoteList
          title={listTitle}
          notes={visible}
          subjects={subjects ?? []}
          selectedNoteId={selectedNoteId}
          showSubject={subjectFilter === 'all'}
          sort={sort}
          onToggleSort={() => setSort((s) => (s === 'updatedAt' ? 'createdAt' : 'updatedAt'))}
          onSelect={setSelectedNoteId}
          onNewNote={() => void newNote()}
        />
      )}
      {openNote ? (
        <Editor
          uid={uid}
          note={openNote}
          subjects={subjects ?? []}
          onDeleted={() => setSelectedNoteId(null)}
          onToast={onToast}
        />
      ) : (
        <section className="editor-pane">
          {!loading && (
            <div className="empty">
              <div className="blob">e</div>
              <h3>Nothing open</h3>
              <p style={{ margin: 0, fontSize: 14 }}>Pick a note on the left, or create one.</p>
            </div>
          )}
        </section>
      )}

      {searchOpen && (
        <SearchPalette
          notes={notes ?? []}
          subjects={subjects ?? []}
          onClose={() => setSearchOpen(false)}
          onOpenNote={(id) => {
            setSearchOpen(false)
            setSubjectFilter('all')
            setTagFilter(null)
            setSelectedNoteId(id)
          }}
          onCreate={(title) => {
            setSearchOpen(false)
            void newNote(title)
          }}
        />
      )}
    </div>
  )
}
