import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db, BACKEND_URL } from '../firebase'
import { auth } from '../firebase'
import type { McpClient, Note, Subject } from './types'

const notesCol = (uid: string) => collection(db(), 'users', uid, 'notes')
const subjectsCol = (uid: string) => collection(db(), 'users', uid, 'subjects')
const clientsCol = (uid: string) => collection(db(), 'users', uid, 'mcpClients')

export function useNotes(uid: string, sort: 'updatedAt' | 'createdAt') {
  const [notes, setNotes] = useState<Note[] | null>(null)
  useEffect(() => {
    const q = query(notesCol(uid), orderBy(sort, 'desc'))
    return onSnapshot(q, (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Note))
    })
  }, [uid, sort])
  return notes
}

export function useSubjects(uid: string) {
  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  useEffect(() => {
    const q = query(subjectsCol(uid), orderBy('createdAt', 'asc'))
    return onSnapshot(q, (snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Subject))
    })
  }, [uid])
  return subjects
}

export function useMcpClients(uid: string) {
  const [clients, setClients] = useState<McpClient[] | null>(null)
  useEffect(() => {
    return onSnapshot(clientsCol(uid), (snap) => {
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as McpClient))
    })
  }, [uid])
  return clients
}

export async function createNote(uid: string, subjectId: string | null): Promise<string> {
  const ref = await addDoc(notesCol(uid), {
    title: '',
    body: '',
    subjectId,
    tags: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    origin: 'user',
  })
  return ref.id
}

export async function updateNote(
  uid: string,
  noteId: string,
  patch: Partial<Pick<Note, 'title' | 'body' | 'subjectId' | 'tags'>>,
) {
  await updateDoc(doc(db(), 'users', uid, 'notes', noteId), {
    ...patch,
    updatedAt: serverTimestamp(),
    origin: 'user',
  })
}

export async function deleteNote(uid: string, noteId: string) {
  await deleteDoc(doc(db(), 'users', uid, 'notes', noteId))
}

export async function createSubject(uid: string, name: string, color: string) {
  await addDoc(subjectsCol(uid), { name, color, createdAt: serverTimestamp() })
}

export async function revokeMcpClient(uid: string, clientId: string) {
  await deleteDoc(doc(db(), 'users', uid, 'mcpClients', clientId))
}

/** Premium tag suggestions from the VPS backend. Throws with a friendly message. */
export async function suggestTags(note: Note): Promise<string[]> {
  if (!BACKEND_URL) {
    throw new Error('Tag suggestions need the backend — set VITE_BACKEND_URL once it’s deployed.')
  }
  const token = await auth().currentUser?.getIdToken()
  const res = await fetch(`${BACKEND_URL}/api/suggest-tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: note.title, body: note.body, existingTags: note.tags }),
  })
  if (!res.ok) throw new Error('Tag suggestions are unavailable right now — try again in a moment.')
  const data = (await res.json()) as { tags?: string[] }
  return (data.tags ?? []).filter((t) => !note.tags.includes(t)).slice(0, 5)
}
