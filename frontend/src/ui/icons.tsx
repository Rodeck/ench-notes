/* Lucide-style inline icons at the system's stroke-width 2.75. */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.75,
  strokeLinecap: 'round' as const,
  viewBox: '0 0 24 24',
}

export function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function SearchIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function ChevronRightIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base} style={{ opacity: 0.5 }}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

export function ChevronDownIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base} style={{ opacity: 0.5 }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function SortDownIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  )
}

export function SortUpIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  )
}

export function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export function SparkIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 3v4M12 17v4M4.9 7.5l2.8 2.8M16.3 13.7l2.8 2.8M3 12h4M17 12h4M4.9 16.5l2.8-2.8M16.3 10.3l2.8-2.8" />
    </svg>
  )
}

export function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

export function UsersIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M21 20a6 6 0 0 0-4-5.6" />
    </svg>
  )
}

export function ListIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base} style={{ opacity: 0.7, flex: 'none' }}>
      <path d="M4 6.5l1.5 1.5L8 5.5M4 12.5l1.5 1.5L8 11.5M4 18.5l1.5 1.5L8 17.5M11 7h9M11 13h9M11 19h9" />
    </svg>
  )
}

export function TableIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...base} style={{ opacity: 0.7, flex: 'none' }}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M3 15h18M10 4v16" />
    </svg>
  )
}
