import type { Timestamp } from 'firebase/firestore'

/** Compact relative time like the design: "2h", "5h", "1d". */
export function relTime(ts: Timestamp | null): string {
  if (!ts) return ''
  const ms = Date.now() - ts.toMillis()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.floor(mo / 12)}y`
}

/** Longer form for the editor footer: "2h ago", "Yesterday", "4 Aug". */
export function agoTime(ts: Timestamp | null): string {
  if (!ts) return ''
  const ms = Date.now() - ts.toMillis()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d} days ago`
  return shortDate(ts)
}

export function shortDate(ts: Timestamp | null): string {
  if (!ts) return ''
  return ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function fullDate(ts: Timestamp | null): string {
  if (!ts) return ''
  return ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
