'use client'

import { useCallback } from 'react'

const SECTIONS = [
  { id: 'business-profile', label: 'Business profile' },
  { id: 'invoice-template', label: 'Invoice template' },
  { id: 'payment-methods', label: 'Payments' },
  { id: 'invoice-notes-default', label: 'Invoice notes' },
  { id: 'payment-instructions', label: 'Payment instructions' },
  { id: 'quote-defaults', label: 'Quote defaults' },
  { id: 'work-profile', label: 'Work profile' },
  { id: 'service-library', label: 'Service library' },
  { id: 'quote-templates', label: 'Quote templates' },
  { id: 'margin-rules', label: 'Margin rules' },
  { id: 'ai-features', label: 'AI features' },
]

export function SettingsNav() {
  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <nav className="flex flex-wrap gap-1.5 mb-6" role="tablist" aria-label="Settings sections">
      {SECTIONS.map(s => (
        <button
          key={s.id}
          onClick={() => scrollTo(s.id)}
          className="rounded-full border px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          {s.label}
        </button>
      ))}
    </nav>
  )
}
