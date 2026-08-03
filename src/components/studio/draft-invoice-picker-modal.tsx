'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface ClientOption {
  id: string
  name: string
  slug: string
  company: string | null
}

interface Props {
  clients: ClientOption[]
  onClose: () => void
}

export function DraftInvoicePickerModal({ clients, onClose }: Props) {
  const router = useRouter()
  const [selectedClientId, setSelectedClientId] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newContactName, setNewContactName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null

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
      if (!res.ok || json.error) {
        setClientError(json.error ?? 'Failed to create client')
        return
      }
      router.push(`/projects/${json.data.slug}/invoices/new`)
    } finally {
      setCreatingClient(false)
    }
  }

  function handleContinue() {
    if (!selectedClientId || !selectedClient) return
    router.push(`/projects/${selectedClient.slug}/invoices/new`)
  }

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === '__new__') {
      setShowNewClient(true)
      setSelectedClientId('')
    } else {
      setSelectedClientId(val)
    }
  }

  const fieldCls =
    'rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Draft invoice</span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </DialogTitle>
          <DialogDescription>
            Pick a client &mdash; you&apos;ll edit the invoice on their page.
          </DialogDescription>
        </DialogHeader>

        {!showNewClient ? (
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Client <span className="text-destructive">*</span>
            </label>
            <select
              value={selectedClientId}
              onChange={handleSelectChange}
              className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select a client…</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.company ? ` — ${c.company}` : ''}
                </option>
              ))}
              <option value="__new__">+ New client…</option>
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              New client
            </label>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setShowNewClient(false) } }}
                placeholder="Business / project name *"
                autoFocus
                className={fieldCls}
              />
              <input
                type="text"
                value={newContactName}
                onChange={e => setNewContactName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setShowNewClient(false) } }}
                placeholder="Contact name (optional)"
                className={fieldCls}
              />
              <input
                type="email"
                value={newClientEmail}
                onChange={e => setNewClientEmail(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleCreateClient() }
                  if (e.key === 'Escape') { setShowNewClient(false) }
                }}
                placeholder="Email (optional)"
                className={fieldCls}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreateClient}
                  disabled={creatingClient || !newClientName.trim()}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {creatingClient ? '…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewClient(false); setNewClientName(''); setNewContactName(''); setNewClientEmail('') }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
              {clientError && <p className="text-xs text-destructive">{clientError}</p>}
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-end gap-2 sm:justify-end">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleContinue}
            disabled={!selectedClientId}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Continue
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
