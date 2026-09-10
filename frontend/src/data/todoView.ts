import type { TodoItem, TodoList, TodoPriority, TodoSortField, TodoTableView } from './types'

/* Table view helpers. The view (kind, sort, filters) is stored on the list
   document so it is shared: when one member filters by "overdue", everyone
   opening that table sees the same filter. */

export const DEFAULT_TABLE_VIEW: TodoTableView = {
  sort: { field: 'dueDate', dir: 'asc' },
  filters: { status: 'all', assigneeId: null, priority: 'any', due: 'any', addedBy: null },
}

/** Sort rank; unset sinks below low. */
export const PRIORITY_RANK: Record<TodoPriority, number> = { high: 3, medium: 2, low: 1 }

/** Names of the people an item is assigned to, for display and sorting. */
export function assigneeNames(item: TodoItem): string {
  return item.assignees.map((a) => a.name).join(', ')
}

export function tableViewOf(list: TodoList): TodoTableView {
  return {
    sort: { ...DEFAULT_TABLE_VIEW.sort, ...(list.table?.sort ?? {}) },
    filters: { ...DEFAULT_TABLE_VIEW.filters, ...(list.table?.filters ?? {}) },
  }
}

export function isDefaultFilters(view: TodoTableView): boolean {
  const f = view.filters
  return f.status === 'all' && !f.assigneeId && f.priority === 'any' && f.due === 'any' && !f.addedBy
}

/** Local calendar date as YYYY-MM-DD, offset by `days`. */
export function dateKey(days = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function matchesFilters(item: TodoItem, view: TodoTableView): boolean {
  const f = view.filters
  if (f.status === 'open' && item.done) return false
  if (f.status === 'done' && !item.done) return false
  if (f.assigneeId === 'none' && item.assignees.length > 0) return false
  if (f.assigneeId && f.assigneeId !== 'none' && !item.assignees.some((a) => a.id === f.assigneeId)) return false
  if (f.priority === 'none' ? item.priority : f.priority !== 'any' && item.priority !== f.priority) return false
  if (f.addedBy && item.addedBy !== f.addedBy) return false
  const today = dateKey()
  switch (f.due) {
    case 'overdue':
      if (!item.dueDate || item.dueDate >= today || item.done) return false
      break
    case 'today':
      if (item.dueDate !== today) return false
      break
    case 'week':
      if (!item.dueDate || item.dueDate < today || item.dueDate > dateKey(7)) return false
      break
    case 'none':
      if (item.dueDate) return false
      break
  }
  return true
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

function keyOf(item: TodoItem, field: TodoSortField): string | number | null {
  switch (field) {
    case 'title':
      return item.title
    case 'done':
      return item.done ? 1 : 0
    case 'assignee':
      return assigneeNames(item)
    case 'priority':
      return item.priority ? PRIORITY_RANK[item.priority] : null
    case 'dueDate':
      return item.dueDate
    case 'addedBy':
      return item.addedByName
    case 'createdAt':
      return item.createdAt?.toMillis() ?? null
  }
}

/** Sort by the view's field; empty values always sink to the bottom. */
export function sortItems(items: TodoItem[], view: TodoTableView): TodoItem[] {
  const { field, dir } = view.sort
  const sign = dir === 'desc' ? -1 : 1
  return [...items].sort((a, b) => {
    const ka = keyOf(a, field)
    const kb = keyOf(b, field)
    if (ka === kb) return (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)
    if (ka === null || ka === '') return 1
    if (kb === null || kb === '') return -1
    const cmp = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : collator.compare(String(ka), String(kb))
    return cmp * sign
  })
}

export function applyView(items: TodoItem[], view: TodoTableView): TodoItem[] {
  return sortItems(
    items.filter((i) => matchesFilters(i, view)),
    view,
  )
}
