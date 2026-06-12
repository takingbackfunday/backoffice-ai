'use client'

export function FunnelIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`w-3 h-3 shrink-0 ${active ? 'text-[#534AB7]' : 'text-muted-foreground opacity-50'}`}
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18l-7 9v6l-4-2v-4L3 4z" />
    </svg>
  )
}
