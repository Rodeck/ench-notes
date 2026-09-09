import { useEffect, useMemo, useState } from 'react'
import type { TodoItem, TodoList, Workspace } from '../data/types'
import {
  addTodoItem,
  deleteTodoItem,
  deleteTodoList,
  renameTodoList,
  setTodoListKind,
  updateTodoItem,
  useTodoItems,
} from '../data/store'
import { TodoTable } from './TodoTable'
import { initials } from '../data/palette'
import { agoTime } from '../data/time'
import { ConfirmDialog } from './ConfirmDialog'
import { MenuIcon, PlusIcon, SparkIcon } from './icons'

interface Props {
  wsId: string
  workspace: Workspace
  list: TodoList
  onDeleted: () => void
  onToast: (msg: string) => void
  /** Opens the sidebar drawer (button only shows below 1024px). */
  onOpenNav: () => void
}

/** Today's date as YYYY-MM-DD in local time (the format items store). */
function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Today", "Tomorrow", "Overdue · 3 Sep", "12 Oct". */
export function dueLabel(due: string, done: boolean): { text: string; tone: 'overdue' | 'soon' | 'normal' } {
  const today = todayKey()
  const [y, m, d] = due.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const short = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  if (done) return { text: short, tone: 'normal' }
  if (due < today) return { text: `Overdue · ${short}`, tone: 'overdue' }
  if (due === today) return { text: 'Today', tone: 'soon' }
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (date.toDateString() === tomorrow.toDateString()) return { text: 'Tomorrow', tone: 'soon' }
  return { text: short, tone: 'normal' }
}

export function TodoPane({ wsId, workspace, list, onDeleted, onToast, onOpenNav }: Props) {
  const items = useTodoItems(wsId, list.id)
  const [name, setName] = useState(list.name)
  const [draft, setDraft] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [menu, setMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => setName(list.name), [list.name])

  const members = useMemo(
    () =>
      Object.entries(workspace.members)
        .map(([uid, m]) => ({ uid, name: m.displayName || m.email }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [workspace.members],
  )

  const open = (items ?? []).filter((i) => !i.done)
  const done = (items ?? []).filter((i) => i.done)

  async function saveName() {
    const next = name.trim()
    if (!next || next === list.name) {
      setName(list.name)
      return
    }
    await renameTodoList(wsId, list.id, next)
  }

  async function add() {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    await addTodoItem(wsId, list.id, { title })
  }

  return (
    <section className={`todo-pane${list.kind === 'table' ? ' is-table' : ''}`}>
      <header className="todo-head">
        <button className="btn btn-icon btn-secondary nav-btn" aria-label="Open menu" onClick={onOpenNav}>
          <MenuIcon />
        </button>
        <input
          className="todo-name"
          value={name}
          maxLength={80}
          aria-label="List name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <div className="todo-head-sub">
          <span className="notelist-count">
            {open.length} open{done.length > 0 ? ` · ${done.length} done` : ''}
          </span>
          <div className="seg seg-sm" style={{ marginLeft: 'auto' }} role="radiogroup" aria-label="View">
            {(['list', 'table'] as const).map((k) => (
              <label key={k} className="seg-opt" data-tip={k === 'table' ? 'Table with shared filters and sorting' : 'A simple checklist'}>
                <input
                  type="radio"
                  name={`kind-${list.id}`}
                  checked={(list.kind ?? 'list') === k}
                  onChange={() => void setTodoListKind(wsId, list.id, k)}
                />
                {k === 'list' ? 'List' : 'Table'}
              </label>
            ))}
          </div>
        </div>
        <span style={{ position: 'relative' }}>
          <button className="btn btn-icon btn-secondary dots-btn" aria-label="List actions" data-tip="List actions" onClick={() => setMenu((v) => !v)}>
            ⋯
          </button>
          {menu && (
            <div className="note-menu">
              <button
                className="danger"
                onClick={() => {
                  setMenu(false)
                  setConfirmDelete(true)
                }}
              >
                Delete list
              </button>
            </div>
          )}
        </span>
      </header>

      <div className="todo-scroll">
        <div className="todo-inner">
          <div className="todo-add">
            <PlusIcon size={14} />
            <input
              className="todo-add-input"
              placeholder="Add an item and press Enter"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add()
              }}
            />
          </div>

          {items === null ? (
            <p className="set-dim" style={{ padding: '8px 4px' }}>
              Loading…
            </p>
          ) : list.kind === 'table' ? (
            <TodoTable wsId={wsId} list={list} items={items} members={members} onToast={onToast} />
          ) : items.length === 0 ? (
            <div className="empty" style={{ padding: 'var(--space-8) 0' }}>
              <div className="blob">✓</div>
              <h3>Nothing to do yet</h3>
              <p style={{ margin: 0, fontSize: 14 }}>
                Add the first item above — everyone in this workspace can tick things off.
              </p>
            </div>
          ) : (
            <>
              <ul className="todo-items">
                {open.map((i) => (
                  <TodoRow key={i.id} wsId={wsId} listId={list.id} item={i} members={members} onToast={onToast} />
                ))}
              </ul>
              {done.length > 0 && (
                <>
                  <button className="todo-done-toggle" onClick={() => setShowDone((v) => !v)}>
                    {showDone ? '▾' : '▸'} Done · {done.length}
                  </button>
                  {showDone && (
                    <ul className="todo-items">
                      {done.map((i) => (
                        <TodoRow key={i.id} wsId={wsId} listId={list.id} item={i} members={members} onToast={onToast} />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <footer className="editor-foot">
        <span>Created by {list.createdByName || 'someone'}</span>
      </footer>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete “${list.name}”?`}
          body="The list and every item in it will be gone for good, for every member — there’s no undo."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            void deleteTodoList(wsId, list.id).then(() => {
              onToast(`${list.name} deleted.`)
              onDeleted()
            })
          }}
        />
      )}
    </section>
  )
}

interface RowProps {
  wsId: string
  listId: string
  item: TodoItem
  members: { uid: string; name: string }[]
  onToast: (msg: string) => void
}

function TodoRow({ wsId, listId, item, members, onToast }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)

  useEffect(() => setTitle(item.title), [item.title])

  const patch = (p: Parameters<typeof updateTodoItem>[3]) => updateTodoItem(wsId, listId, item.id, p)

  async function saveTitle() {
    setEditing(false)
    const next = title.trim()
    if (!next) {
      setTitle(item.title)
      return
    }
    if (next !== item.title) await patch({ title: next })
  }

  function setAssignee(uid: string) {
    const m = members.find((x) => x.uid === uid)
    void patch({ assigneeId: m?.uid ?? null, assigneeName: m?.name ?? null })
  }

  const due = item.dueDate ? dueLabel(item.dueDate, item.done) : null

  return (
    <li className={`todo-item${item.done ? ' done' : ''}`}>
      <button
        className={`todo-check${item.done ? ' on' : ''}`}
        aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
        onClick={() => void patch({ done: !item.done })}
      >
        {item.done && '✓'}
      </button>
      <div className="todo-body">
        {editing ? (
          <input
            className="todo-title-input"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                setTitle(item.title)
                setEditing(false)
              }
            }}
          />
        ) : (
          <button className="todo-title" onClick={() => setEditing(true)} data-tip="Click to edit">
            {item.title}
          </button>
        )}
        <div className="todo-meta">
          <label className={`todo-assignee${item.assigneeId ? ' set' : ''}`} data-tip="Assignee">
            <span className="avatar avatar-xs">{item.assigneeName ? initials(item.assigneeName) : '?'}</span>
            <span>{item.assigneeName ?? 'Unassigned'}</span>
            <select value={item.assigneeId ?? ''} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`todo-due${due ? ` ${due.tone}` : ''}`} data-tip="Due date">
            <span>{due ? due.text : 'No date'}</span>
            <input
              type="date"
              value={item.dueDate ?? ''}
              onChange={(e) => void patch({ dueDate: e.target.value || null })}
            />
          </label>
          <span className="todo-by">
            {item.origin === 'mcp' && <SparkIcon />}
            added by {item.addedByName || 'someone'}
            {item.done && item.doneAt ? ` · done ${agoTime(item.doneAt)}` : ''}
          </span>
          <button
            className="todo-x"
            aria-label="Delete item"
            onClick={() => void deleteTodoItem(wsId, listId, item.id).then(() => onToast('Item removed.'))}
          >
            ✕
          </button>
        </div>
      </div>
    </li>
  )
}
