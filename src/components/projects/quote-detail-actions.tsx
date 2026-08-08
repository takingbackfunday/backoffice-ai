'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Download, Edit, CheckCircle2, Circle, MoreHorizontal,
  Send, GitBranch, Bookmark, X, Loader2, Plus, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PortalDropdown } from '@/components/ui/portal-dropdown'
import { useOutsideClick } from '@/hooks/use-outside-click'
import { SaveTemplateModal, sectionsFromQuote } from './save-template-modal'
import { QuoteSendEmailModal } from './quote-send-email-modal'
import { removePendingMarkSentQuote } from '@/lib/pending-mark-sent'
import type { QuoteSection } from './quote-detail-client'

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

interface QuoteActionsData {
  id: string
  quoteNumber: string
  title: string
  status: string
  version: number
  isAmendment: boolean
  clientEmail: string | null
}

interface Props {
  projectId: string
  projectSlug: string
  quote: QuoteActionsData
  sections: QuoteSection[]
  invoicesCount: number
  onAction: (path: string, method?: string, body?: object) => Promise<Record<string, unknown> | null>
  loading: string | null
  onDownloaded: () => void
}

/* ------------------------------------------------------------------ */
/*  Stepper                                                             */
/* ------------------------------------------------------------------ */

function StatusStepper({ status }: { status: string }) {
  const steps = ['DRAFT', 'SENT', 'ACCEPTED'] as const
  const currentIdx = steps.indexOf(status as typeof steps[number])
  if (currentIdx === -1) return null

  return (
    <div className="flex items-center gap-2 mb-4">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          {i <= currentIdx ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : i === currentIdx + 1 ? (
            <Circle className="w-5 h-5 text-primary font-medium fill-primary/10" />
          ) : (
            <Circle className="w-5 h-5 text-muted-foreground" />
          )}
          <span className={cn(
            'text-xs font-medium',
            i <= currentIdx ? 'text-green-600' : i === currentIdx + 1 ? 'text-primary' : 'text-muted-foreground'
          )}>
            {s === 'DRAFT' ? 'Draft' : s === 'SENT' ? 'Sent' : 'Accepted'}
          </span>
          {i < 2 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function QuoteDetailActions({ projectId, projectSlug, quote, sections, invoicesCount, onAction, loading, onDownloaded }: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [sendSaving, setSendSaving] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const menuAnchorRef = useRef<HTMLButtonElement>(null)
  useOutsideClick(
    { current: menuAnchorRef.current?.closest('[data-portal-dropdown]') as HTMLElement | null ?? document.body } as React.RefObject<HTMLElement | null>,
    () => setMenuOpen(false),
    { enabled: menuOpen, ignoreSelector: '[data-portal-dropdown]' }
  )

  const isDraft = quote.status === 'DRAFT'
  const isSent = quote.status === 'SENT'
  const isAccepted = quote.status === 'ACCEPTED' || quote.status === 'AMENDED'

  async function handleDownload() {
    const a = document.createElement('a')
    a.href = `/api/projects/${projectId}/quotes/${quote.id}/pdf`
    a.download = `${quote.quoteNumber}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    onDownloaded()
  }

  async function handleSendEmail(message: string) {
    setSendSaving(true)
    setSendError(null)
    try {
      const result = await onAction('send', 'POST', { message })
      if (result) {
        setSendModalOpen(false)
        router.refresh()
      }
    } catch {
      setSendError('Failed to send')
    } finally {
      setSendSaving(false)
    }
  }

  async function handleDuplicate() {
    const result = await onAction('duplicate')
    if (result) router.push(`/projects/${projectSlug}/quotes/${result.id}/edit`)
  }

  return (
    <div className="space-y-3">
      {(isDraft || isSent || isAccepted) && <StatusStepper status={quote.status} />}

      <div className="flex items-center gap-2 flex-wrap">
        {isDraft && (
          <>
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
            <Link href={`/projects/${projectSlug}/quotes/${quote.id}/edit`}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Link>
            <button
              onClick={async () => {
                const res = await onAction('send', 'POST', { markOnly: true })
                if (res) {
                  removePendingMarkSentQuote(quote.id)
                  router.refresh()
                }
              }}
              disabled={loading === 'send'}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {loading === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Mark as sent
            </button>
          </>
        )}

        {isSent && (
          <>
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
            <button onClick={async () => { const r = await onAction('accept'); if (r) router.refresh() }}
              disabled={loading === 'accept'}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent disabled:opacity-50">
              {loading === 'accept' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
              Mark accepted
            </button>
          </>
        )}

        {isAccepted && (
          <>
            <button onClick={() => onDownloaded()}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5" /> Create Invoice
            </button>
            <button onClick={handleDownload}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent">
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
          </>
        )}

        <div className="relative">
          <button ref={menuAnchorRef} type="button" onClick={() => setMenuOpen(o => !o)}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent" aria-label="More actions">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          <PortalDropdown anchorRef={menuAnchorRef} open={menuOpen} align="right"
            className="min-w-[180px] rounded-xl border bg-background shadow-xl py-1">
            <button type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
              onClick={() => { setMenuOpen(false); window.open(`/api/projects/${projectId}/quotes/${quote.id}/pdf`, '_blank') }}>
              Preview PDF
            </button>
            <button type="button" disabled={!quote.clientEmail}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left disabled:opacity-40 disabled:cursor-not-allowed"
              title={!quote.clientEmail ? 'Add a client email address to send directly' : ''}
              onClick={() => { setMenuOpen(false); setSendModalOpen(true) }}>
              <Send className="w-3.5 h-3.5" /> Send by email…
            </button>
            {!quote.isAmendment && <div className="my-1 border-t" />}
            {!quote.isAmendment && (
              <>
                <button type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                  onClick={() => { setMenuOpen(false); handleDuplicate() }}>
                  <GitBranch className="w-3.5 h-3.5" /> Duplicate
                </button>
                <button type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                  onClick={() => { setMenuOpen(false); setTemplateModalOpen(true) }}>
                  <Bookmark className="w-3.5 h-3.5" /> Save as template
                </button>
              </>
            )}
            <div className="my-1 border-t" />
            {isSent && (
              <button type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                onClick={async () => { setMenuOpen(false); const r = await onAction('revise'); if (r) router.push(`/projects/${projectSlug}/quotes/${r.id}/edit`) }}>
                Revise
              </button>
            )}
            {quote.status === 'ACCEPTED' && (
              <button type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                onClick={async () => { setMenuOpen(false); const r = await onAction('revise'); if (r) router.push(`/projects/${projectSlug}/quotes/${r.id}/edit`) }}>
                <Plus className="w-3.5 h-3.5" /> Add change order
              </button>
            )}
            {(isSent || (isAccepted && invoicesCount === 0)) && (
              <button type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left text-red-600"
                onClick={async () => {
                  setMenuOpen(false)
                  if (!confirm('Mark this quote as cancelled (client withdrew)? This cannot be undone.')) return
                  const r = await onAction('cancel'); if (r) router.refresh()
                }}>
                <X className="w-3.5 h-3.5" /> Cancel quote
              </button>
            )}
            {isDraft && (
              <button type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left text-red-600"
                onClick={async () => {
                  setMenuOpen(false)
                  if (!confirm('Delete this draft quote? This cannot be undone.')) return
                  const res = await fetch(`/api/projects/${projectId}/quotes/${quote.id}`, { method: 'DELETE' })
                  if (res.ok) router.push(`/projects/${projectSlug}/quotes`)
                }}>
                <X className="w-3.5 h-3.5" /> Delete
              </button>
            )}
          </PortalDropdown>
        </div>
      </div>

      <QuoteSendEmailModal
        open={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        onSend={handleSendEmail}
        saving={sendSaving}
        error={sendError}
        clientEmail={quote.clientEmail}
      />

      <SaveTemplateModal open={templateModalOpen} onOpenChange={setTemplateModalOpen} sections={sectionsFromQuote(sections.map(s => ({
        id: s.id, name: s.name,
        items: s.items.map(i => ({ id: i.id, description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, costRate: i.costRate, tags: i.tags, isOptional: i.isOptional })),
      })))} />
    </div>
  )
}
