import { useEffect, useRef, useState } from 'react'
import type { TodoAssignee, TodoPriority } from '../data/types'
import { TODO_PRIORITIES } from '../data/types'
import { initials } from '../data/palette'

/* Field controls shared by the checklist rows and the table rows. */

export interface Member {
  uid: string
  name: string
}

export const PRIORITY_LABEL: Record<TodoPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' }

/** Pick any number of workspace members. Shows stacked avatars and names;
    opens a checklist of members. */
export function AssigneePicker({
  assignees,
  members,
  onChange,
}: {
  assignees: TodoAssignee[]
  members: Member[]
  onChange: (next: TodoAssignee[]) => void
}) {
  const [open, setOpen] = useState(false)
  // Viewport position of the menu: fixed, so the table's scroll box never clips it.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  function toggleOpen() {
    if (open) return setOpen(false)
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: Math.min(r.bottom + 4, window.innerHeight - 40 * (members.length + 2)), left: Math.min(r.left, window.innerWidth - 220) })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  function toggle(m: Member) {
    const has = assignees.some((a) => a.id === m.uid)
    onChange(has ? assignees.filter((a) => a.id !== m.uid) : [...assignees, { id: m.uid, name: m.name }])
  }

  const label =
    assignees.length === 0
      ? 'Unassigned'
      : assignees.length <= 2
        ? assignees.map((a) => a.name).join(', ')
        : `${assignees[0].name} +${assignees.length - 1}`

  return (
    <span className="assignee-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`todo-assignee${assignees.length ? ' set' : ''}`}
        data-tip="Assignees"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        <span className="avatar-stack">
          {assignees.length === 0 ? (
            <span className="avatar avatar-xs">?</span>
          ) : (
            assignees.slice(0, 3).map((a) => (
              <span key={a.id} className="avatar avatar-xs">
                {initials(a.name)}
              </span>
            ))
          )}
        </span>
        <span>{label}</span>
      </button>
      {open && pos && (
        <div className="note-menu assignee-menu" role="menu" style={pos}>
          {members.map((m) => {
            const on = assignees.some((a) => a.id === m.uid)
            return (
              <button key={m.uid} role="menuitemcheckbox" aria-checked={on} className={on ? 'on' : ''} onClick={() => toggle(m)}>
                <span className="avatar avatar-xs">{initials(m.name)}</span>
                <span className="grow">{m.name}</span>
                <span className="check">{on ? '✓' : ''}</span>
              </button>
            )
          })}
          {assignees.length > 0 && (
            <>
              <div className="ws-menu-sep" />
              <button
                onClick={() => {
                  onChange([])
                  setOpen(false)
                }}
              >
                Unassign everyone
              </button>
            </>
          )}
        </div>
      )}
    </span>
  )
}

/** High / Medium / Low, or unset. A chip over a native select so the
    picker works the same on phones. */
export function PriorityPicker({
  priority,
  onChange,
}: {
  priority: TodoPriority | null
  onChange: (next: TodoPriority | null) => void
}) {
  return (
    <label className={`todo-prio${priority ? ` ${priority}` : ''}`} data-tip="Priority">
      <span className="prio-flag" aria-hidden="true">
        {priority === 'high' ? '!!' : priority === 'medium' ? '!' : priority === 'low' ? '·' : '–'}
      </span>
      <span>{priority ? PRIORITY_LABEL[priority] : 'No priority'}</span>
      <select value={priority ?? ''} onChange={(e) => onChange((e.target.value as TodoPriority) || null)} aria-label="Priority">
        <option value="">No priority</option>
        {TODO_PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
    </label>
  )
}
