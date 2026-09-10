import { useEffect, useMemo, useState } from 'react'
import type { TodoItem, TodoList, TodoSortField, TodoTableView } from '../data/types'
import { deleteTodoItem, setTodoTableView, updateTodoItem } from '../data/store'
import { applyView, isDefaultFilters, tableViewOf } from '../data/todoView'
import { shortDate } from '../data/time'
import { dueLabel } from './TodoPane'
import { SparkIcon } from './icons'
import { AssigneePicker, PRIORITY_LABEL, PriorityPicker } from './TodoFields'
import { TODO_PRIORITIES } from '../data/types'

interface Props {
  wsId: string
  list: TodoList
  items: TodoItem[]
  members: { uid: string; name: string }[]
  onToast: (msg: string) => void
}

const COLUMNS: { field: TodoSortField; label: string }[] = [
  { field: 'done', label: '' },
  { field: 'title', label: 'Item' },
  { field: 'assignee', label: 'Assignees' },
  { field: 'priority', label: 'Priority' },
  { field: 'dueDate', label: 'Due' },
  { field: 'addedBy', label: 'Added by' },
  { field: 'createdAt', label: 'Created' },
]

/** Table view: sortable columns and filters. Sort and filters live on the
    list document, so what one member sets, everyone sees. */
export function TodoTable({ wsId, list, items, members, onToast }: Props) {
  const view = useMemo(() => tableViewOf(list), [list])
  const rows = useMemo(() => applyView(items, view), [items, view])

  const setFilters = (filters: Partial<TodoTableView['filters']>) => setTodoTableView(wsId, list.id, { filters })

  function toggleSort(field: TodoSortField) {
    const dir = view.sort.field === field && view.sort.dir === 'asc' ? 'desc' : 'asc'
    void setTodoTableView(wsId, list.id, { sort: { field, dir } })
  }

  const hidden = items.length - rows.length

  return (
    <div className="todo-table-wrap">
      <div className="todo-toolbar" role="group" aria-label="Filters">
        <div className="seg seg-sm">
          {(['all', 'open', 'done'] as const).map((s) => (
            <label key={s} className="seg-opt">
              <input
                type="radio"
                name={`status-${list.id}`}
                checked={view.filters.status === s}
                onChange={() => void setFilters({ status: s })}
              />
              {s[0].toUpperCase() + s.slice(1)}
            </label>
          ))}
        </div>
        <select
          className="pill-select"
          value={view.filters.assigneeId ?? ''}
          onChange={(e) => void setFilters({ assigneeId: e.target.value || null })}
          aria-label="Filter by assignee"
        >
          <option value="">Any assignee</option>
          <option value="none">Unassigned</option>
          {members.map((m) => (
            <option key={m.uid} value={m.uid}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          className="pill-select"
          value={view.filters.priority}
          onChange={(e) => void setFilters({ priority: e.target.value as TodoTableView['filters']['priority'] })}
          aria-label="Filter by priority"
        >
          <option value="any">Any priority</option>
          {TODO_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
          <option value="none">No priority</option>
        </select>
        <select
          className="pill-select"
          value={view.filters.due}
          onChange={(e) => void setFilters({ due: e.target.value as TodoTableView['filters']['due'] })}
          aria-label="Filter by due date"
        >
          <option value="any">Any date</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Due this week</option>
          <option value="none">No date</option>
        </select>
        <select
          className="pill-select"
          value={view.filters.addedBy ?? ''}
          onChange={(e) => void setFilters({ addedBy: e.target.value || null })}
          aria-label="Filter by who added"
        >
          <option value="">Added by anyone</option>
          {members.map((m) => (
            <option key={m.uid} value={m.uid}>
              Added by {m.name}
            </option>
          ))}
        </select>
        {!isDefaultFilters(view) && (
          <button
            className="btn btn-ghost"
            style={{ marginTop: 0 }}
            onClick={() => void setFilters({ status: 'all', assigneeId: null, priority: 'any', due: 'any', addedBy: null })}
          >
            Clear
          </button>
        )}
        <span className="todo-toolbar-note">
          {hidden > 0 ? `${hidden} hidden by filters · ` : ''}shared view
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="table todo-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.field} aria-sort={view.sort.field === c.field ? (view.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button
                    className={`th-sort${view.sort.field === c.field ? ' on' : ''}`}
                    data-tip={`Sort by ${c.label || 'done'}`}
                    onClick={() => toggleSort(c.field)}
                  >
                    {c.label || '✓'}
                    {view.sort.field === c.field && <span className="th-dir">{view.sort.dir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <TableRow key={i.id} wsId={wsId} listId={list.id} item={i} members={members} onToast={onToast} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="palette-empty">
            {items.length === 0 ? 'No items yet — add one above.' : 'Nothing matches these filters.'}
          </p>
        )}
      </div>
    </div>
  )
}

interface RowProps {
  wsId: string
  listId: string
  item: TodoItem
  members: { uid: string; name: string }[]
  onToast: (msg: string) => void
}

function TableRow({ wsId, listId, item, members, onToast }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  useEffect(() => setTitle(item.title), [item.title])

  const patch = (p: Parameters<typeof updateTodoItem>[3]) => updateTodoItem(wsId, listId, item.id, p)

  async function saveTitle() {
    setEditing(false)
    const next = title.trim()
    if (!next) return setTitle(item.title)
    if (next !== item.title) await patch({ title: next })
  }

  const due = item.dueDate ? dueLabel(item.dueDate, item.done) : null

  return (
    <tr className={item.done ? 'done' : ''}>
      <td>
        <button
          className={`todo-check${item.done ? ' on' : ''}`}
          aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
          onClick={() => void patch({ done: !item.done })}
        >
          {item.done && '✓'}
        </button>
      </td>
      <td className="td-title">
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
            {item.origin === 'mcp' && <SparkIcon />} {item.title}
          </button>
        )}
      </td>
      <td>
        <AssigneePicker assignees={item.assignees} members={members} onChange={(assignees) => void patch({ assignees })} />
      </td>
      <td>
        <PriorityPicker priority={item.priority} onChange={(priority) => void patch({ priority })} />
      </td>
      <td>
        <label className={`todo-due${due ? ` ${due.tone}` : ''}`} data-tip="Due date">
          <span>{due ? due.text : 'No date'}</span>
          <input type="date" value={item.dueDate ?? ''} onChange={(e) => void patch({ dueDate: e.target.value || null })} />
        </label>
      </td>
      <td className="set-dim">{item.addedByName || '—'}</td>
      <td className="set-dim">{shortDate(item.createdAt)}</td>
      <td style={{ textAlign: 'right' }}>
        <button
          className="todo-x"
          aria-label="Delete item"
          onClick={() => void deleteTodoItem(wsId, listId, item.id).then(() => onToast('Item removed.'))}
        >
          ✕
        </button>
      </td>
    </tr>
  )
}
