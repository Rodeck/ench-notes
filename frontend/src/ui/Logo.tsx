/* The ench notes mark: a note card with a folded corner and the AI spark,
   on an accent tile. Same geometry as public/favicon.svg — keep the two in
   sync. The tile follows the theme's accent; the paper stays paper so the
   mark reads the same in dark mode. */
export function Logo({ size = 28, title = 'ench notes' }: { size?: number; title?: string }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <rect width="64" height="64" rx="17" fill="var(--color-accent)" />
      <g transform="rotate(-7 30 32)">
        <path
          d="M16 8h18l12 12v31a4.5 4.5 0 0 1-4.5 4.5H16A4.5 4.5 0 0 1 11.5 51V12.5A4.5 4.5 0 0 1 16 8z"
          fill="#f5ead8"
        />
        <path d="M34 8v7.5a4.5 4.5 0 0 0 4.5 4.5H46z" fill="#e9b790" />
        <path
          d="M20 29h16M20 38h16M20 47h8"
          stroke="var(--color-accent)"
          strokeWidth="4.4"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M49 34c1.4 7.6 4 10.2 11.6 11.6c-7.6 1.4-10.2 4-11.6 11.6c-1.4-7.6-4-10.2-11.6-11.6c7.6-1.4 10.2-4 11.6-11.6z"
        fill="#f5ead8"
        stroke="var(--color-accent)"
        strokeWidth="2.6"
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  )
}
