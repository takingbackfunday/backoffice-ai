'use client'

import { useState, useRef, useCallback } from 'react'
import { Loader2, Sparkles, Check, AlertTriangle, Globe, HelpCircle, ChevronRight } from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────

interface GeneratedItem {
  description: string
  quantity: number
  unit: string
  rate: number
  isOptional?: boolean
}

interface GeneratedSection {
  name: string
  items: GeneratedItem[]
}

interface ClarificationQuestion {
  question: string
  context: string
  suggestions: string[]
}

interface PipelineResult {
  template: {
    id: string
    name: string
    sections: GeneratedSection[]
  }
  searchSources: string[]
  assumptions: string[]
  pricingRationale: string
}

type Step =
  | 'input'
  | 'analyzing'
  | 'searching'
  | 'generating'
  | 'validating'
  | 'clarifying'
  | 'done'
  | 'error'

interface ErrorState {
  step: string
  message: string
  detail?: string
}

// ── Component ───────────────────────────────────────────────────────

interface Props {
  onCreated: (templateId: string) => void
  workDescription?: string
  currency?: string
}

function placeholderFromWorkDescription(desc?: string): string {
  if (!desc) return "e.g. I need to shoot a 3-minute brand video for a local coffee shop — 1 shoot day, interview setup, b-roll, and a 30-second social cut..."
  const lower = desc.toLowerCase()
  if (lower.includes('video') || lower.includes('film') || lower.includes('produc') || lower.includes('document')) {
    return "e.g. I need to produce a 3-part documentary series — pre-production research, location interviews, 4 shoot days, post-production editing, color grading, and original score..."
  }
  if (lower.includes('design') || lower.includes('brand') || lower.includes('graphic')) {
    return "e.g. Full brand identity for a new organic skincare line — logo, packaging, web assets, and brand guidelines with 2 rounds of revisions..."
  }
  if (lower.includes('web') || lower.includes('develop') || lower.includes('site')) {
    return "e.g. E-commerce site rebuild for a boutique — 10 product pages, cart integration, CMS setup, responsive design, and SEO optimization..."
  }
  if (lower.includes('photo') || lower.includes('shoot')) {
    return "e.g. Product photography for a new fashion collection — 30 looks, 3 angles each, retouching, and e-commerce delivery..."
  }
  if (lower.includes('market') || lower.includes('social') || lower.includes('content')) {
    return "e.g. Q4 social media campaign for a tech startup — 12 posts, 3 short-form videos, community management, and monthly analytics report..."
  }
  if (lower.includes('consult') || lower.includes('coach') || lower.includes('advisor')) {
    return "e.g. 3-month strategy engagement for a SaaS company — discovery, competitive analysis, roadmap, and bi-weekly advisory calls..."
  }
  if (lower.includes('event') || lower.includes('wedding') || lower.includes('plan')) {
    return "e.g. Full-service event planning for a 150-person corporate gala — venue sourcing, vendor coordination, day-of management, and teardown..."
  }
  if (lower.includes('write') || lower.includes('copy') || lower.includes('editorial')) {
    return "e.g. Website copy rewrite for a law firm — homepage, 5 practice area pages, about, and blog launch package with SEO keywords..."
  }
  return "e.g. I need to produce a 3-part documentary series — pre-production research, location interviews, 4 shoot days, post-production editing, color grading, and original score..."
}

export function GenerateTemplateForm({ onCreated, workDescription, currency }: Props) {
  const [description, setDescription] = useState('')
  const [step, setStep] = useState<Step>('input')
  const stepRef = useRef<Step>('input')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<ErrorState | null>(null)
  const [result, setResult] = useState<PipelineResult | null>(null)
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [refinementText, setRefinementText] = useState('')
  const [refining, setRefining] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Keep stepRef in sync so async closures can read the latest value
  const setStepSynced = useCallback((s: Step) => {
    stepRef.current = s
    setStep(s)
  }, [])

  const reset = useCallback(() => {
    setStepSynced('input')
    setError(null)
    setResult(null)
    setQuestions([])
    setAnswers([])
    setRefinementText('')
    setRefining(false)
    setStatusMessage('')
  }, [setStepSynced])

  const handleGenerate = useCallback(async (clarificationAnswers?: string[], existingTemplateArg?: PipelineResult['template'] | null) => {
    if (description.trim().length < 10) return

    // Cancel any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStepSynced('analyzing')
    setError(null)
    setRefining(false)
    setStatusMessage('Analyzing project description...')

    try {
      const body: Record<string, unknown> = {
        description: description.trim(),
        clarificationAnswers,
        currency,
      }
      if (existingTemplateArg) {
        body.existingTemplate = existingTemplateArg
      }

      const res = await fetch('/api/quote-templates/generate/audacious', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setError({
          step: 'request',
          message: json.error ?? `Request failed with status ${res.status}`,
        })
        setStepSynced('error')
        return
      }

      // Parse SSE stream
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let gotTemplate = false
      let streamDone = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') { streamDone = true; break }

          let event: Record<string, unknown>
          try { event = JSON.parse(data) } catch { continue }

          switch (event.type) {
            case 'status': {
              const stepMap: Record<string, Step> = {
                analyzing: 'analyzing',
                searching: 'searching',
                generating: 'generating',
                validating: 'validating',
              }
              const s = event.step as string
              if (stepMap[s]) setStepSynced(stepMap[s])
              setStatusMessage(event.message as string ?? '')
              break
            }

            case 'clarification_needed': {
              const qs = event.questions as ClarificationQuestion[]
              setQuestions(qs)
              setAnswers(new Array(qs.length).fill(''))
              setStepSynced('clarifying')
              break
            }

            case 'template': {
              const d = event.data as PipelineResult
              if (d.template.id) {
                setResult(d)
                gotTemplate = true
                setStepSynced('done')
              }
              break
            }

            case 'error': {
              setError({
                step: event.step as string,
                message: event.message as string,
                detail: event.detail as string | undefined,
              })
              setStepSynced('error')
              break
            }

            case 'done':
              break
          }
        }
        if (streamDone) break
      }

      // If stream ended without a template or error event
      if (!gotTemplate && stepRef.current !== 'error' && stepRef.current !== 'clarifying') {
        setError({
          step: 'stream',
          message: 'The generation stream ended unexpectedly without producing a template. Please try again.',
        })
        setStepSynced('error')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError({
        step: 'network',
        message: `Network error: ${err instanceof Error ? err.message : 'Failed to connect'}. Check your connection and try again.`,
      })
      setStepSynced('error')
    }
  }, [description, currency])

  const handleClarificationSubmit = useCallback(() => {
    const filledAnswers = answers.filter(a => a.trim().length > 0)
    if (filledAnswers.length === 0) return

    // Combine questions with answers for context
    const combined = questions.map((q, i) => {
      const answer = answers[i]?.trim()
      return answer ? `${q.question} → ${answer}` : null
    }).filter(Boolean) as string[]

    setStep('analyzing')
    handleGenerate(combined)
  }, [answers, questions, handleGenerate])

  const busy = step === 'analyzing' || step === 'searching' || step === 'generating' || step === 'validating'

  // ── Rendering ─────────────────────────────────────────────────────

  // Loading state
  if (busy) {
    const stepLabels: Record<string, string> = {
      analyzing: 'Analyzing project description',
      searching: 'Searching the web for pricing benchmarks',
      generating: 'Generating audacious quote',
      validating: 'Validating output',
    }
    const stepOrder = ['analyzing', 'searching', 'generating', 'validating']
    const currentIdx = stepOrder.indexOf(step)

    return (
      <div className="flex flex-col py-6 gap-4">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
          <p className="text-sm font-medium">{statusMessage}</p>
        </div>

        {/* Step progress */}
        <div className="space-y-2 pl-8">
          {stepOrder.map((s, i) => {
            const isActive = i === currentIdx
            const isDone = i < currentIdx
            return (
              <div key={s} className={`flex items-center gap-2 text-xs ${isDone ? 'text-primary' : isActive ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                {isDone ? (
                  <Check className="w-3 h-3" />
                ) : isActive ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <div className="w-3 h-3 rounded-full border border-muted-foreground/30" />
                )}
                {stepLabels[s]}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground/60 pl-8">
          This may take 15-30 seconds while we research market rates and build a comprehensive quote.
        </p>
      </div>
    )
  }

  // Error state — fail loudly
  if (step === 'error' && error) {
    const stepLabels: Record<string, string> = {
      request: 'Request',
      analyzing: 'Analysis',
      searching: 'Web search',
      generating: 'Generation',
      validating: 'Validation',
      parsing: 'JSON parsing',
      saving: 'Database save',
      stream: 'Stream',
      network: 'Network',
      unknown: 'Unknown',
    }

    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1.5 min-w-0">
              <p className="text-sm font-medium text-destructive">
                Failed at: {stepLabels[error.step] ?? error.step}
              </p>
              <p className="text-sm text-foreground">{error.message}</p>
              {error.detail && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">Technical details</summary>
                  <pre className="mt-1 p-2 rounded bg-muted/50 overflow-x-auto whitespace-pre-wrap break-all text-[11px]">
                    {error.detail}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleGenerate()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
          >
            <Sparkles className="w-3 h-3" />
            Try again
          </button>
          <button
            type="button"
            onClick={reset}
            className="px-3 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground"
          >
            Start over
          </button>
        </div>
      </div>
    )
  }

  // Clarification state
  if (step === 'clarifying') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">We need a bit more detail to generate the best quote</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Answer any that apply — the more detail, the more accurate the pricing.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {questions.map((q, qi) => (
            <div key={qi} className="space-y-1.5">
              <p className="text-sm font-medium">{q.question}</p>
              {q.context && (
                <p className="text-xs text-muted-foreground">{q.context}</p>
              )}
              {q.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {q.suggestions.map((s, si) => (
                    <button
                      key={si}
                      type="button"
                      onClick={() => {
                        const next = [...answers]
                        next[qi] = next[qi] === s ? '' : s
                        setAnswers(next)
                      }}
                      className={`px-2 py-1 rounded text-xs border transition-colors ${
                        answers[qi] === s
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted border-muted-foreground/20'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={answers[qi] ?? ''}
                onChange={e => {
                  const next = [...answers]
                  next[qi] = e.target.value
                  setAnswers(next)
                }}
                placeholder="Or type your own answer..."
                className="w-full border rounded px-2.5 py-1.5 text-xs bg-background"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClarificationSubmit}
            disabled={answers.every(a => !a.trim())}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
            Generate with these details
          </button>
          <button
            type="button"
            onClick={() => handleGenerate()}
            className="px-3 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground"
          >
            Skip — generate anyway
          </button>
        </div>
      </div>
    )
  }

  // Done state — show the audacious template
  if (step === 'done' && result) {
    const fmt = (n: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

    const totalItems = result.template.sections.reduce((s, sec) => s + sec.items.length, 0)
    const requiredTotal = result.template.sections.reduce(
      (s, sec) => s + sec.items.filter(i => !i.isOptional).reduce((ss, i) => ss + i.quantity * i.rate, 0), 0
    )
    const optionalTotal = result.template.sections.reduce(
      (s, sec) => s + sec.items.filter(i => i.isOptional).reduce((ss, i) => ss + i.quantity * i.rate, 0), 0
    )

    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="rounded-lg border bg-primary/5 px-4 py-3 flex items-center gap-3">
          <Check className="w-5 h-5 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{result.template.name}</p>
            <p className="text-xs text-muted-foreground">
              {result.template.sections.length} section{result.template.sections.length !== 1 ? 's' : ''}, {totalItems} items
              {optionalTotal > 0 && ` — ${fmt(requiredTotal)} required + ${fmt(optionalTotal)} optional`}
            </p>
          </div>
        </div>

        {/* Pricing rationale */}
        {result.pricingRationale && (
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Pricing strategy</p>
            <p className="text-xs">{result.pricingRationale}</p>
          </div>
        )}

        {/* Assumptions */}
        {result.assumptions.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Assumptions made</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {result.assumptions.map((a, i) => (
                <li key={i}>— {a}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Search sources */}
        {result.searchSources.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="w-3 h-3" />
            <span>Pricing verified against {result.searchSources.length} web source{result.searchSources.length !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Template preview */}
        <div className="rounded-lg border bg-background">
          <div className="px-3 py-2 border-b bg-muted/20">
            <p className="text-sm font-medium">{result.template.name}</p>
          </div>
          <div className="px-3 py-2 space-y-2.5">
            {result.template.sections.map((s, si) => (
              <div key={si}>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{s.name}</p>
                <div className="mt-1 space-y-0.5">
                  {s.items.map((item, ii) => (
                    <div key={ii} className="flex items-center justify-between text-xs">
                      <span className="text-foreground truncate mr-2">
                        {item.description}
                        {item.isOptional && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">optional</span>
                        )}
                      </span>
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

        {/* Refinement section */}
        {refining ? (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <p className="text-xs font-medium">What would you like to change?</p>
            <p className="text-xs text-muted-foreground">
              Describe what you want adjusted — rates, scope, sections, optional items, assumptions, or anything else.
            </p>
            <textarea
              rows={3}
              value={refinementText}
              onChange={e => setRefinementText(e.target.value)}
              placeholder="e.g. Lower the day rate to $1,800, remove the rush fee, and add drone footage as an optional add-on."
              className="w-full border rounded px-2.5 py-1.5 text-xs bg-background resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleGenerate([refinementText.trim()], result.template)}
                disabled={!refinementText.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                <Sparkles className="w-3 h-3" />
                Regenerate
              </button>
              <button
                type="button"
                onClick={() => setRefining(false)}
                className="px-3 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onCreated(result.template.id)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              <Check className="w-4 h-4" />
              Use this template
            </button>
            <button
              type="button"
              onClick={() => setRefining(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-accent"
            >
              <Sparkles className="w-3 h-3" />
              Refine
            </button>
          </div>
        )}
      </div>
    )
  }

  // Input state (default)
  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{error.message}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Describe a specific upcoming job and we&rsquo;ll generate an <strong>audacious</strong> quote template — comprehensive scope, premium pricing, and web-verified rates.
      </p>
      <textarea
        rows={3}
        value={description}
        onChange={e => setDescription(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && description.trim().length >= 10) {
            e.preventDefault()
            handleGenerate()
          }
        }}
        placeholder={placeholderFromWorkDescription(workDescription)}
        className="w-full border rounded px-3 py-2 text-sm bg-background resize-none"
      />
      <button
        type="button"
        onClick={() => handleGenerate()}
        disabled={description.trim().length < 10}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <Sparkles className="w-3 h-3" />
        Generate audacious quote
      </button>
    </div>
  )
}
