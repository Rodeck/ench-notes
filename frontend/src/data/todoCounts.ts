import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import type { TodoList } from './types'

/** Live open-item counts per list, for the sidebar badges. One listener per
    list; the data set is small (a workspace's lists). */
export function useTodoOpenCounts(wsId: string, lists: TodoList[]): Map<string, number> {
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const key = lists.map((l) => l.id).join(',')
  useEffect(() => {
    setCounts(new Map())
    const unsubs = lists.map((l) =>
      onSnapshot(
        query(collection(db(), 'workspaces', wsId, 'todoLists', l.id, 'items'), where('done', '==', false)),
        (snap) => setCounts((prev) => new Map(prev).set(l.id, snap.size)),
        () => {},
      ),
    )
    return () => unsubs.forEach((u) => u())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, key])
  return counts
}
