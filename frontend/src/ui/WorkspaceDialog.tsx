import { useEffect, useState } from 'react'
import type { Workspace } from '../data/types'
import {
  defaultWorkspaceId,
  deleteWorkspace,
  removeWorkspaceMember,
  renameWorkspace,
  shareWorkspace,
} from '../data/store'
import { initials } from '../data/palette'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  uid: string
  workspace: Workspace
  onClose: () => void
  onToast: (msg: string) => void
  /** Called after the user leaves or deletes this workspace. */
  onGone: () => void
}

/** Manage one workspace: rename (owner), share by email (owner), list and
    remove members (owner), leave (member), delete (owner, non-default). */
export function WorkspaceDialog({ uid, workspace, onClose, onToast, onGone }: Props) {
  const isOwner = workspace.ownerId === uid
  const isDefault = workspace.id === defaultWorkspaceId(uid)
  const [name, setName] = useState(workspace.name)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<'leave' | 'delete' | { removeUid: string } | null>(null)

  useEffect(() => setName(workspace.name), [workspace.name])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirm) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, confirm])

  /** Run one action with busy/error handling; resolves true on success. */
  async function run(key: string, fn: () => Promise<void>, done?: string): Promise<boolean> {
    setBusy(key)
    setError('')
    try {
      await fn()
      if (done) onToast(done)
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setBusy(null)
    }
  }

  async function saveName() {
    const next = name.trim()
    if (!next || next === workspace.name) {
      setName(workspace.name)
      return
    }
    await run('rename', () => renameWorkspace(workspace.id, next), 'Workspace renamed.')
  }

  async function invite() {
    const target = email.trim()
    if (!target) return
    const ok = await run('share', () => shareWorkspace(workspace.id, target), `Shared with ${target}.`)
    if (ok) setEmail('')
  }

  const members = Object.entries(workspace.members).sort(([a, ma], [b, mb]) => {
    if (ma.role !== mb.role) return ma.role === 'owner' ? -1 : 1
    if (a === uid) return -1
    if (b === uid) return 1
    return ma.displayName.localeCompare(mb.displayName)
  })

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog ws-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{isOwner ? 'Workspace settings' : workspace.name}</div>

        {isOwner ? (
          <label className="ws-field">
            <span className="set-label">Name</span>
            <input
              className="input"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
          </label>
        ) : (
          <p className="dialog-body" style={{ margin: 0 }}>
            Shared with you by {workspace.members[workspace.ownerId]?.displayName ?? 'the owner'}. You can add,
            edit, and delete any note here.
          </p>
        )}

        <div className="ws-field">
          <span className="set-label">
            Members <span className="set-dim">· {members.length}</span>
          </span>
          <ul className="ws-members">
            {members.map(([memberUid, m]) => (
              <li key={memberUid} className="ws-member">
                <span className="avatar">{initials(m.displayName || m.email)}</span>
                <span className="ws-member-txt">
                  <span className="ws-member-name">
                    {m.displayName || m.email}
                    {memberUid === uid && <span className="set-dim"> (you)</span>}
                  </span>
                  <span className="ws-member-mail">{m.email}</span>
                </span>
                {m.role === 'owner' ? (
                  <span className="tag tag-neutral">owner</span>
                ) : isOwner ? (
                  <button className="revoke-btn" onClick={() => setConfirm({ removeUid: memberUid })}>
                    Remove
                  </button>
                ) : memberUid === uid ? (
                  <button className="revoke-btn" onClick={() => setConfirm('leave')}>
                    Leave
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        {isOwner && (
          <div className="ws-field">
            <span className="set-label">Share with someone</span>
            <div className="ws-invite">
              <input
                className="input"
                type="email"
                placeholder="their@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void invite()
                }}
              />
              <button
                className="btn btn-primary"
                style={{ flex: 'none' }}
                disabled={!email.trim() || busy === 'share'}
                onClick={() => void invite()}
              >
                {busy === 'share' ? 'Sharing…' : 'Share'}
              </button>
            </div>
            <span className="set-dim">
              They need an ench notes account. Members can add, edit, and delete any note in this workspace,
              including through their AI assistant.
            </span>
          </div>
        )}

        {error && <div className="login-err">{error}</div>}

        <div className="dialog-actions" style={{ justifyContent: 'space-between' }}>
          <span>
            {isOwner && !isDefault && (
              <button className="revoke-btn" onClick={() => setConfirm('delete')}>
                Delete workspace
              </button>
            )}
          </span>
          <button className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      {confirm === 'leave' && (
        <ConfirmDialog
          title={`Leave ${workspace.name}?`}
          body="You lose access to its notes until the owner shares it with you again."
          confirmLabel="Leave"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            void run('leave', () => removeWorkspaceMember(workspace.id, uid), `Left ${workspace.name}.`).then(
              (ok) => ok && onGone(),
            )
          }}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          title={`Delete ${workspace.name}?`}
          body="Every note and subject in it will be gone for good, for every member — there’s no undo."
          confirmLabel="Delete"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            void run('delete', () => deleteWorkspace(workspace.id), `${workspace.name} deleted.`).then(
              (ok) => ok && onGone(),
            )
          }}
        />
      )}
      {confirm && typeof confirm === 'object' && (
        <ConfirmDialog
          title={`Remove ${workspace.members[confirm.removeUid]?.displayName ?? 'this member'}?`}
          body="They lose access to this workspace immediately. Notes they wrote stay."
          confirmLabel="Remove"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const target = confirm.removeUid
            setConfirm(null)
            void run('remove', () => removeWorkspaceMember(workspace.id, target), 'Member removed.')
          }}
        />
      )}
    </div>
  )
}
