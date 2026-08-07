'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, Sparkles, SkipForward } from 'lucide-react'

interface GeneratedTemplate {
  id: string
  name: string
  sections: { name: string; items: { description: string; quantity: number; unit: string; rate: number }[] }[]
}

interface GeneratedItem {
  id: string
  description: string
  unit: string | null
  defaultRate: number
  tags: string[]
  groupName: string | null
}

interface Props {
  initialDescription?: string
  skipTarget?: string
  mode?: 'onboarding' | 'inline'
  onComplete?: () => void
}

export function WorkProfileSetup({ initialDescription, skipTarget = '/studio?onboarding=1', mode = 'onboarding', onComplete }: Props) {
  const router = useRouter()
  const [description, setDescription] = useState(initialDescription ?? '')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'input' | 'generating' | 'review'>('input')
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<GeneratedTemplate[]>([])
  const [serviceItems, setServiceItems] = useState<GeneratedItem[]>([])

  const handleGenerate = useCallback(async () => {
    if (description.trim().length < 10) return
    setBusy(true)
    setError(null)
    setStep('generating')
    try {
      const res = await fetch('/api/setup/work-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to generate work profile')
        setStep('input')
        return
      }
      setTemplates(json.data.templates)
      setServiceItems(json.data.serviceItems)
      setStep('review')
    } catch {
      setError('Failed to generate. Please try again.')
      setStep('input')
    } finally {
      setBusy(false)
    }
  }, [description])

  const handleConfirm = useCallback(() => {
    if (mode === 'inline' && onComplete) {
      onComplete()
    } else {
      router.push(skipTarget)
    }
  }, [mode, onComplete, router, skipTarget])

  const handleSkip = useCallback(() => {
    if (mode === 'inline' && onComplete) {
      onComplete()
    } else {
      router.push(skipTarget)
    }
  }, [mode, onComplete, router, skipTarget])

  function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  }

  if (step === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Generating your templates and service library...</p>
        <p className="text-xs text-muted-foreground/60">This takes a few seconds</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {step === 'input' && (
        <>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Tell us what you do in a few sentences. We&rsquo;ll generate quote templates and a service-item library tailored to your work.
            </p>
            <textarea
              rows={4}
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy && description.trim().length >= 10) {
                  e.preventDefault()
                  handleGenerate()
                }
              }}
              placeholder="e.g. I'm a wedding videographer. I shoot weddings, create highlight reels, and also do corporate video work."
              disabled={busy}
              className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy || description.trim().length < 10}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate templates &amp; library
            </button>

            {mode === 'onboarding' && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <SkipForward className="w-4 h-4" />
                Skip for now
              </button>
            )}
          </div>
        </>
      )}

      {step === 'review' && (
        <>
          <div className="rounded-lg border bg-primary/5 px-4 py-3 flex items-center gap-3">
            <Check className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">Generated {templates.length} template{templates.length !== 1 ? 's' : ''} and {serviceItems.length} service item{serviceItems.length !== 1 ? 's' : ''}</p>
              <p className="text-xs text-muted-foreground">Review what we created below. You can always edit or remove them later in Settings.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Templates column */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Templates</h3>
              {templates.map(t => (
                <div key={t.id} className="rounded-lg border bg-background">
                  <div className="px-3 py-2 border-b bg-muted/20">
                    <p className="text-sm font-medium">{t.name}</p>
                  </div>
                  <div className="px-3 py-2 space-y-2">
                    {t.sections.map((s, si) => (
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
              ))}
            </div>

            {/* Service items column */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Service Library</h3>
              <div className="rounded-lg border bg-background divide-y">
                {serviceItems.map(item => (
                  <div key={item.id} className="px-3 py-2 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{item.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{item.unit ?? 'x'}</span>
                        {item.groupName && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {item.groupName}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground ml-2">{fmt(item.defaultRate)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              <Check className="w-4 h-4" />
              Looks good, save
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="px-4 py-2 rounded-lg border text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  )
}
