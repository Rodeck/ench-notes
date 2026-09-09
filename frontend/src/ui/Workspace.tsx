import { useEffect, useMemo, useState } from 'react'
import {
  createNote,
  defaultWorkspaceId,
  updateNote,
  useNotes,
  useSubjects,
  useTodoLists,
  useWorkspaces,
} from '../data/store'
import { useTodoOpenCounts } from '../data/todoCounts'
import type { Workspace as WorkspaceDoc } from '../data/types'
import { Sidebar } from './Sidebar'
import { NoteList } from './NoteList'
import { Editor } from './Editor'
import { SearchPalette } from './SearchPalette'
import { WorkspaceDialog } from './WorkspaceDialog'
import { NewWorkspaceDialog } from './NewWorkspaceDialog'
import { TodoPane } from './TodoPane'

interface Props {
  uid: string
  onOpenSettings: () => void
  onToast: (msg: string) => void
}

const lastWorkspaceKey = (uid: string) => `ench:lastWorkspace:${uid}`

function readLastWorkspace(uid: string): string | null {
  try {
    return localStorage.getItem(lastWorkspaceKey(uid))
  } catch {
    return null
  }
}

export function Workspace({ uid, onOpenSettings, onToast }: Props) {
  const workspaces = useWorkspaces(uid)
  const [wsId, setWsId] = useState<string>(() => readLastWorkspace(uid) ?? defaultWorkspaceId(uid))
  const [manageOpen, setManageOpen] = useState(false)
  const [newWsOpen, setNewWsOpen] = useState(false)

  // Fall back to the default workspace when the chosen one disappears
  // (left, deleted, or removed by the owner). Wait until the default is in
  // the list: on first sign-in it is created a moment after the query starts.
  useEffect(() => {
    if (!workspaces) return
    const def = defaultWorkspaceId(uid)
    if (!workspaces.some((w) => w.id === wsId) && workspaces.some((w) => w.id === def)) setWsId(def)
  }, [workspaces, wsId, uid])

  useEffect(() => {
    try {
      localStorage.setItem(lastWorkspaceKey(uid), wsId)
    } catch {
      /* private mode etc. */
    }
  }, [uid, wsId])

  const current: WorkspaceDoc | null = workspaces?.find((w) => w.id === wsId) ?? null

  if (!workspaces || !current) {
    return (
      <div className="workspace">
        <aside className="sidebar" />
        <section className="notelist">
          <div className="empty">
            <p style={{ margin: 0 }}>Loading your workspaces…</p>
          </div>
        </section>
        <section className="editor-pane" />
      </div>
    )
  }

  return (
    <>
      <WorkspaceNotes
        key={current.id}
        uid={uid}
        workspace={current}
        workspaces={workspaces}
        onSelectWorkspace={setWsId}
        onOpenSettings={onOpenSettings}
        onToast={onToast}
        onManage={() => setManageOpen(true)}
        onCreateWorkspace={() => setNewWsOpen(true)}
      />
      {manageOpen && (
        <WorkspaceDialog
          uid={uid}
          workspace={current}
          onClose={() => setManageOpen(false)}
          onToast={onToast}
          onGone={() => {
            setManageOpen(false)
            setWsId(defaultWorkspaceId(uid))
          }}
        />
      )}
      {newWsOpen && (
        <NewWorkspaceDialog
          onClose={() => setNewWsOpen(false)}
          onCreated={(id) => {
            setNewWsOpen(false)
            setWsId(id)
            setManageOpen(true)
          }}
        />
      )}
    </>
  )
}

interface NotesProps {
  uid: string
  workspace: WorkspaceDoc
  workspaces: WorkspaceDoc[]
  onSelectWorkspace: (id: string) => void
  onOpenSettings: () => void
  onToast: (msg: string) => void
  onManage: () => void
  onCreateWorkspace: () => void
}

/** The three-pane notes UI for one workspace. Keyed on the workspace id by
    the parent so filters and selection reset when switching. */
function WorkspaceNotes({
  uid,
  workspace,
  workspaces,
  onSelectWorkspace,
  onOpenSettings,
  onToast,
  onManage,
  onCreateWorkspace,
}: NotesProps) {
  const wsId = workspace.id
  const [sort, setSort] = useState<'updatedAt' | 'createdAt'>('updatedAt')
  const notes = useNotes(wsId, sort)
  const subjects = useSubjects(wsId)
  const todoLists = useTodoLists(wsId)
  const todoCounts = useTodoOpenCounts(wsId, todoLists ?? [])
  // Which todo list is open; null means the notes view.
  const [listId, setListId] = useState<string | null>(null)
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
    const id = await createNote(wsId, subjectId)
    if (title) await updateNote(wsId, id, { title })
    setSelectedNoteId(id)
  }

  const subjectName =
    subjectFilter === 'all'
      ? 'All notes'
      : (subjects?.find((s) => s.id === subjectFilter)?.name ?? 'All notes')
  const listTitle = tagFilter ? `#${tagFilter}` : subjectName

  const openNote = visible.find((n) => n.id === selectedNoteId) ?? null
  const loading = notes === null || subjects === null
  const openList = listId ? (todoLists?.find((l) => l.id === listId) ?? null) : null

  // Back to notes when the open list disappears (deleted by someone else).
  useEffect(() => {
    if (listId && todoLists && !todoLists.some((l) => l.id === listId)) setListId(null)
  }, [listId, todoLists])

  return (
    <div className={`workspace${openNote && !openList ? ' show-editor' : ''}${openList ? ' show-todo' : ''}`}>
      <Sidebar
        uid={uid}
        workspace={workspace}
        workspaces={workspaces}
        onSelectWorkspace={onSelectWorkspace}
        onCreateWorkspace={onCreateWorkspace}
        onManageWorkspace={onManage}
        subjects={subjects ?? []}
        notes={notes ?? []}
        todoLists={todoLists ?? []}
        todoCounts={todoCounts}
        selectedList={listId}
        onSelectList={setListId}
        selectedSubject={subjectFilter}
        onSelectSubject={(id) => {
          setListId(null)
          setSubjectFilter(id)
          setTagFilter(null)
        }}
        tagFilter={tagFilter}
        onTagFilter={(t) => {
          setListId(null)
          setTagFilter(t)
        }}
        onNewNote={() => void newNote()}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={onOpenSettings}
      />
      {openList ? (
        <TodoPane
          key={openList.id}
          wsId={wsId}
          workspace={workspace}
          list={openList}
          onDeleted={() => setListId(null)}
          onToast={onToast}
        />
      ) : loading ? (
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
      {openList ? null : openNote ? (
        <Editor
          wsId={wsId}
          shared={workspace.memberIds.length > 1}
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
