import { useEffect, useRef, useState } from 'react'
import type { Workspace } from '../data/types'
import { ChevronDownIcon, PlusIcon, UsersIcon } from './icons'

interface Props {
  uid: string
  workspaces: Workspace[]
  current: Workspace
  onSelect: (id: string) => void
  onCreate: () => void
  onManage: () => void
}

/** Sidebar header: the current workspace's name, opening a menu to switch,
    create, or manage workspaces. */
export function WorkspaceSwitcher({ uid, workspaces, current, onSelect, onCreate, onManage }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const shared = current.memberIds.length > 1

  return (
    <div className="ws-wrap" ref={wrapRef}>
      <button
        className="ws-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Switch workspace"
      >
        <span className="ws-btn-txt">
          <span className="ws-kicker">Workspace</span>
          <span className="ws-name">{current.name}</span>
        </span>
        {shared && (
          <span className="ws-shared" title={`Shared with ${current.memberIds.length - 1} other`}>
            <UsersIcon />
          </span>
        )}
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="ws-menu" role="menu">
          {workspaces.map((w) => {
            const isShared = w.memberIds.length > 1
            const mine = w.ownerId === uid
            return (
              <button
                key={w.id}
                role="menuitem"
                className={`ws-item${w.id === current.id ? ' on' : ''}`}
                onClick={() => {
                  setOpen(false)
                  onSelect(w.id)
                }}
              >
                <span className="ws-item-name">{w.name}</span>
                <span className="ws-item-sub">
                  {!mine
                    ? `Shared by ${w.members[w.ownerId]?.displayName ?? 'someone'}`
                    : isShared
                      ? `${w.memberIds.length} members`
                      : 'Only you'}
                </span>
              </button>
            )
          })}
          <div className="ws-menu-sep" />
          <button
            role="menuitem"
            className="ws-item ws-item-action"
            onClick={() => {
              setOpen(false)
              onCreate()
            }}
          >
            <PlusIcon size={14} />
            New workspace
          </button>
          <button
            role="menuitem"
            className="ws-item ws-item-action"
            onClick={() => {
              setOpen(false)
              onManage()
            }}
          >
            <UsersIcon size={14} />
            Members &amp; settings
          </button>
        </div>
      )}
    </div>
  )
}
