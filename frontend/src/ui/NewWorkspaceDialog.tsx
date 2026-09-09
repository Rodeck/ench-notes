import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { createWorkspace } from '../data/store'

interface Props {
  onClose: () => void
  onCreated: (id: string) => void
}

/** Name a new workspace. Sharing happens right after, in the manage dialog. */
export function NewWorkspaceDialog({ onClose, onCreated }: Props) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed || !user || busy) return
    setBusy(true)
    setError('')
    try {
      onCreated(await createWorkspace(user, trimmed))
    } catch {
      setError('Couldn’t create the workspace — check your connection and try again.')
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">New workspace</div>
        <div className="dialog-body">
          A separate set of notes and subjects. Share it with others to keep a list together — they
          can add, edit, and delete notes in it, and so can their AI assistants.
        </div>
        <input
          ref={inputRef}
          className="input"
          placeholder="Workspace name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
        {error && <div className="login-err">{error}</div>}
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!name.trim() || busy} onClick={() => void submit()}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
