'use client'

import { useState } from 'react'
import { Loader2, Sparkles, Check } from 'lucide-react'

interface GeneratedTemplate {
  id: string
  name: string
  sections: { name: string; items: { description: string; quantity: number; unit: string; rate: number }[] }[]
}

interface Props {
  onCreated: (templateId: string) => void
}

export function GenerateTemplateForm({ onCreated }: Props) {
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'input' | 'generating' | 'done'>('input')
  const [error, setError] = useState<string | null>(null)
  const [template, setTemplate] = useState<GeneratedTemplate | null>(null)

  async function handleGenerate() {
    if (description.trim().length < 10) return
    setBusy(true)
    setError(null)
    setStep('generating')
    try {
      const res = await fetch('/api/quote-templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to generate template')
        setStep('input')
        return
      }
      setTemplate(json.data)
      setStep('done')
    } catch {
      setError('Failed to generate. Please try again.')
      setStep('input')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Generating template from your description...</p>
        <p className="text-xs text-muted-foreground/60">This takes a few seconds</p>
      </div>
    )
  }

  if (step === 'done' && template) {
    function fmt(n: number) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
    }
    return (
      <div className="space-y-3">
        <div className="rounded-lg border bg-primary/5 px-4 py-3 flex items-center gap-3">
          <Check className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Template created: {template.name}</p>
            <p className="text-xs text-muted-foreground">
              {template.sections.length} section{template.sections.length !== 1 ? 's' : ''} with{' '}
              {template.sections.reduce((s, sec) => s + sec.items.length, 0)} items
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-background">
          <div className="px-3 py-2 border-b bg-muted/20">
            <p className="text-sm font-medium">{template.name}</p>
          </div>
          <div className="px-3 py-2 space-y-2">
            {template.sections.map((s, si) => (
              <div key={si}>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{s.name}</p>
                <div className="mt-1 space-y-0.5">
                  {s.items.map((item, ii) => (
                    <div key={ii} className="flex items-center justify-between text-xs">
                      <span className="text-foreground truncate mr-2">{item.description}</span>
                      <span className="text-muted-foreground whitespace-nowrap tabular-nums">
                        {item.quantity} × {fmt(item.rate)}/{item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onCreated(template.id)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Check className="w-4 h-4" />
          Use this template
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{error}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Describe a specific upcoming job and we&rsquo;ll generate a template tailored to it.
      </p>
      <textarea
        rows={3}
        value={description}
        onChange={e => setDescription(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy && description.trim().length >= 10) {
            e.preventDefault()
            handleGenerate()
          }
        }}
        placeholder="e.g. I need to shoot a 3-minute brand video for a local coffee shop — 1 shoot day, interview setup, b-roll, and a 30-second social cut..."
        disabled={busy}
        className="w-full border rounded px-3 py-2 text-sm bg-background resize-none"
      />
      <button
        type="button"
        onClick={handleGenerate}
        disabled={busy || description.trim().length < 10}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        Generate template
      </button>
    </div>
  )
}
