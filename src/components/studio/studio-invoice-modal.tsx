'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import { InvoiceEditor } from '@/components/projects/invoice-editor'
import { NewInvoiceShortcuts } from '@/components/projects/new-invoice-shortcuts'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

interface ClientOption {
  id: string
  name: string
  slug: string
  clientProfileId: string
  contactName: string | null
  email: string | null
  company: string | null
  currency: string
  paymentTermDays: number
  billingType: string
  jobs: { id: string; name: string }[]
  acceptedQuotes: { id: string; quoteNumber: string; title: string; totalQuoted: number | null; currency: string }[]
}

interface InvoiceDefaults {
  taxEnabled?: boolean
  taxLabel?: string
  taxMode?: 'percent' | 'flat'
  taxRate?: string
  currency?: string
  notes?: string
}

interface Props {
  clients: ClientOption[]
  paymentMethods: PaymentMethods
  invoiceDefaults?: InvoiceDefaults
  onClose: () => void
}

export function StudioInvoiceModal({ clients, paymentMethods, invoiceDefaults, onClose }: Props) {
  const [selectedClientId, setSelectedClientId] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newContactName, setNewContactName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  const [allClients, setAllClients] = useState(clients)
  const readyRef = useRef(false)

  useEffect(() => { readyRef.current = true }, [])

  const selectedClient = allClients.find(c => c.id === selectedClientId) ?? null

  async function handleCreateClient() {
    if (!newClientName.trim()) return
    setCreatingClient(true)
    setClientError(null)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newClientName.trim(),
          type: 'CLIENT',
          client: {
            contactName: newContactName.trim() || undefined,
            email: newClientEmail.trim() || undefined,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setClientError(json.error ?? 'Failed to create client'); return }
      const p = json.data
      const newClient: ClientOption = {
        id: p.id,
        name: p.name,
        slug: p.slug,
        clientProfileId: p.clientProfile?.id ?? '',
        contactName: newContactName.trim() || null,
        email: p.clientProfile?.email || newClientEmail.trim() || null,
        company: null,
        currency: p.clientProfile?.currency ?? 'USD',
        paymentTermDays: p.clientProfile?.paymentTermDays ?? 30,
        billingType: p.clientProfile?.billingType ?? 'HOURLY',
        jobs: [],
        acceptedQuotes: [],
      }
      setAllClients(prev => [...prev, newClient])
      setSelectedClientId(p.id)
      setShowNewClient(false)
      setNewClientName('')
      setNewContactName('')
      setNewClientEmail('')
    } finally {
      setCreatingClient(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-stretch justify-end"
      onMouseDown={e => { if (e.target === e.currentTarget && readyRef.current) onClose() }}
    >
      <div className="w-full max-w-5xl bg-background flex flex-col h-full shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="font-semibold text-sm">New invoice</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Client selector */}
        <div className="px-6 py-4 border-b shrink-0 bg-muted/20">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">Client</label>
              {showNewClient ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={newClientName}
                    onChange={e => setNewClientName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { setShowNewClient(false) } }}
                    placeholder="Business / project name *"
                    autoFocus
                    className="rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-44"
                  />
                  <input
                    type="text"
                    value={newContactName}
                    onChange={e => setNewContactName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { setShowNewClient(false) } }}
                    placeholder="Contact name (optional)"
                    className="rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-44"
                  />
                  <input
                    type="email"
                    value={newClientEmail}
                    onChange={e => setNewClientEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateClient() } if (e.key === 'Escape') { setShowNewClient(false) } }}
                    placeholder="Email (optional)"
                    className="rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-44"
                  />
                  <button
                    type="button"
                    onClick={handleCreateClient}
                    disabled={creatingClient || !newClientName.trim()}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {creatingClient ? '…' : 'Create'}
                  </button>
                  <button type="button" onClick={() => { setShowNewClient(false); setNewClientName(''); setNewContactName(''); setNewClientEmail('') }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                  {clientError && <span className="text-xs text-destructive">{clientError}</span>}
                </div>
              ) : (
                <>
                  <select
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    className="rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[200px]"
                  >
                    <option value="">Select a client…</option>
                    {allClients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewClient(true)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                  >
                    <Plus className="h-3 w-3" /> New client
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
          {!selectedClient ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a client above to start the invoice
            </div>
          ) : (
            <>
              <NewInvoiceShortcuts
                projectId={selectedClient.id}
                projectSlug={selectedClient.slug}
                clientName={selectedClient.contactName ?? selectedClient.name}
                acceptedQuotes={selectedClient.acceptedQuotes}
              />
              <InvoiceEditor
                key={selectedClient.id}
                mode="create"
                projectId={selectedClient.id}
                projectSlug={selectedClient.slug}
                clientName={selectedClient.contactName ?? selectedClient.name}
                clientEmail={selectedClient.email}
                paymentTermDays={selectedClient.paymentTermDays}
                billingType={selectedClient.billingType}
                company={selectedClient.company}
                jobs={selectedClient.jobs}
                lastInvoiceDefaults={invoiceDefaults ? {
                  taxEnabled: invoiceDefaults.taxEnabled ?? false,
                  taxLabel: invoiceDefaults.taxLabel ?? 'Tax',
                  taxMode: invoiceDefaults.taxMode ?? 'percent',
                  taxRate: invoiceDefaults.taxRate ?? '',
                  currency: invoiceDefaults.currency ?? 'USD',
                  notes: invoiceDefaults.notes ?? '',
                } : undefined}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
