import { useCallback, useEffect, useRef, useState } from 'react'
import type { Note, Subject } from '../data/types'
import { tagHue } from '../data/palette'
import { agoTime, shortDate } from '../data/time'
import { deleteNote, suggestTags, updateNote } from '../data/store'
import { useAuth } from '../auth'
import { Markdown } from './Markdown'
import { ConfirmDialog } from './ConfirmDialog'
import { ChevronDownIcon, PlusIcon } from './icons'

interface Props {
  uid: string
  note: Note
  subjects: Subject[]
  onDeleted: () => void
  onToast: (msg: string) => void
}

export function Editor({ uid, note, subjects, onDeleted, onToast }: Props) {
  const { profile } = useAuth()
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [saving, setSaving] = useState(false)
  const [subjectMenu, setSubjectMenu] = useState(false)
  const [noteMenu, setNoteMenu] = useState(false)
  const [addingTag, setAddingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [suggested, setSuggested] = useState<string[] | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ title: string; body: string } | null>(null)
  const noteId = note.id

  // Reset the draft when a different note opens; flush anything unsaved first.
  useEffect(() => {
    setTitle(note.title)
    setBody(note.body)
    setSuggested(null)
    setAddingTag(false)
    setNoteMenu(false)
    setSubjectMenu(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  const flush = useCallback(
    async (id: string) => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      const p = pending.current
      if (!p) return
      pending.current = null
      setSaving(true)
      try {
        await updateNote(uid, id, p)
      } finally {
        setSaving(false)
      }
    },
    [uid],
  )

  // Flush on unmount / note switch so the last keystroke is never lost.
  useEffect(() => {
    return () => {
      void flush(noteId)
    }
  }, [noteId, flush])

  function scheduleSave(nextTitle: string, nextBody: string) {
    pending.current = { title: nextTitle, body: nextBody }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(noteId), 600)
  }

  async function setSubject(subjectId: string | null) {
    setSubjectMenu(false)
    await updateNote(uid, noteId, { subjectId })
  }

  async function addTag(raw: string) {
    const t = raw.trim().replace(/^#/, '').toLowerCase()
    if (!t || note.tags.includes(t)) return
    await updateNote(uid, noteId, { tags: [...note.tags, t] })
  }

  async function removeTag(t: string) {
    await updateNote(uid, noteId, { tags: note.tags.filter((x) => x !== t) })
  }

  async function acceptSuggestion(t: string) {
    setSuggested((s) => s?.filter((x) => x !== t) ?? null)
    await addTag(t)
  }

  async function runSuggest() {
    if (!profile?.premium) return
    setSuggesting(true)
    try {
      const tags = await suggestTags({ ...note, title, body })
      if (tags.length === 0) onToast('No new tags to suggest for this note.')
      setSuggested(tags)
    } catch (err) {
      onToast((err as Error).message)
    } finally {
      setSuggesting(false)
    }
  }

  const subject = subjects.find((s) => s.id === note.subjectId) ?? null

  return (
    <section className="editor-pane">
      <div className="editor-scroll">
        <div className="editor-inner">
          <input
            className="note-title-input"
            placeholder="Untitled"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              scheduleSave(e.target.value, body)
            }}
          />

          <div className="metarow">
            <button className="subject-pick" onClick={() => setSubjectMenu((v) => !v)}>
              <span
                className="dot8"
                style={{
                  background: subject?.color ?? 'color-mix(in srgb, var(--color-text) 35%, transparent)',
                }}
              />
              {subject?.name ?? 'No subject'}
              <ChevronDownIcon />
            </button>
            {subjectMenu && (
              <div className="subject-menu">
                <button onClick={() => void setSubject(null)}>
                  <span
                    className="dot8"
                    style={{ background: 'color-mix(in srgb, var(--color-text) 35%, transparent)' }}
                  />
                  No subject
                </button>
                {subjects.map((s) => (
                  <button key={s.id} onClick={() => void setSubject(s.id)}>
                    <span className="dot8" style={{ background: s.color }} />
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            <span className="vsep" />
            {note.tags.map((t) => {
              const hue = tagHue(t)
              return (
                <span key={t} className="tag" style={{ background: hue.bg, color: hue.fg }}>
                  #{t}
                  <button className="tag-x" aria-label={`Remove tag ${t}`} onClick={() => void removeTag(t)}>
                    ✕
                  </button>
                </span>
              )
            })}
            {addingTag ? (
              <input
                className="tag-add-input"
                autoFocus
                placeholder="tag name"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onBlur={() => {
                  setAddingTag(false)
                  setTagDraft('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void addTag(tagDraft)
                    setTagDraft('')
                    setAddingTag(false)
                  }
                  if (e.key === 'Escape') {
                    setAddingTag(false)
                    setTagDraft('')
                  }
                }}
              />
            ) : (
              <button className="tag-add-btn" onClick={() => setAddingTag(true)}>
                <PlusIcon size={11} />
                add tag
              </button>
            )}
            <button
              className="suggest-btn"
              disabled={!profile?.premium || suggesting}
              title={profile?.premium ? undefined : 'Tag suggestions are a Premium feature'}
              onClick={() => void runSuggest()}
            >
              ✦ {suggesting ? 'Suggesting…' : 'Suggest tags'}
              {!profile?.premium && <span className="tag tag-neutral" style={{ fontSize: 10, padding: '1px 7px' }}>Premium</span>}
            </button>
          </div>

          {suggested && suggested.length > 0 && (
            <div className="suggest-row">
              <span className="suggest-label">Suggested</span>
              {suggested.map((t) => (
                <button key={t} className="suggest-chip" onClick={() => void acceptSuggestion(t)}>
                  #{t}
                  <span
                    className="x"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSuggested((s) => s?.filter((x) => x !== t) ?? null)
                    }}
                  >
                    ✕
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="modebar">
            <div className="seg">
              <label className="seg-opt">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'edit'}
                  onChange={() => setMode('edit')}
                />
                Edit
              </label>
              <label className="seg-opt">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'preview'}
                  onChange={() => setMode('preview')}
                />
                Preview
              </label>
            </div>
          </div>

          {mode === 'edit' ? (
            <textarea
              className="md-edit"
              placeholder="Write in markdown…"
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                scheduleSave(title, e.target.value)
              }}
            />
          ) : (
            <Markdown source={body} />
          )}
        </div>
      </div>

      <footer className="editor-foot">
        <span>
          Created {shortDate(note.createdAt)} · Updated {agoTime(note.updatedAt)}
        </span>
        <span className="saved-ind">
          <span className="pulse" />
          {saving ? 'Saving…' : 'Saved'}
        </span>
        <span className="editor-foot-right" style={{ position: 'relative' }}>
          {note.origin === 'mcp' && (
            <span className="claude-chip">
              ✦ Edited by {note.originClient ?? 'assistant'}, {agoTime(note.updatedAt)}
            </span>
          )}
          <button
            className="btn btn-icon btn-secondary dots-btn"
            aria-label="Note actions"
            onClick={() => setNoteMenu((v) => !v)}
          >
            ⋯
          </button>
          {noteMenu && (
            <div className="note-menu">
              <button
                className="danger"
                onClick={() => {
                  setNoteMenu(false)
                  setConfirmDelete(true)
                }}
              >
                Delete note
              </button>
            </div>
          )}
        </span>
      </footer>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this note?"
          body={`“${note.title || 'Untitled'}” will be gone for good — there’s no undo.`}
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            pending.current = null
            void deleteNote(uid, noteId).then(onDeleted)
          }}
        />
      )}
    </section>
  )
}
