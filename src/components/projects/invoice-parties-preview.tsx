'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ClientProfileForm } from '@/components/projects/client-profile-form'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface InvoicePartiesPreviewProps {
  projectId: string
  workspaceName: string
  fromName: string
  fromAddress?: string | null
  fromEmail?: string | null
  fromPhone?: string | null
  fromWebsite?: string | null
  fromVatNumber?: string | null
  clientContactName?: string | null
  clientCompany?: string | null
  clientAddress?: string | null
  clientEmail?: string | null
  clientPhone?: string | null
}

interface RowProps {
  label: string
  value?: string | null
  flagged?: boolean
}

function PreviewRow({ label, value, flagged }: RowProps) {
  const empty = !value?.trim()
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      {empty ? (
        <span
          className={cn(
            'italic',
            flagged ? 'text-amber-600' : 'text-muted-foreground'
          )}
        >
          Not set
        </span>
      ) : (
        <span className="break-words text-foreground">{value}</span>
      )}
    </div>
  )
}

export function InvoicePartiesPreview({
  projectId,
  workspaceName,
  fromName,
  fromAddress,
  fromEmail,
  fromPhone,
  fromWebsite,
  fromVatNumber,
  clientContactName,
  clientCompany,
  clientAddress,
  clientEmail,
  clientPhone,
}: InvoicePartiesPreviewProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editData, setEditData] = useState({
    contactName: clientContactName ?? '',
    company: clientCompany ?? '',
    email: clientEmail ?? '',
    phone: clientPhone ?? '',
    address: clientAddress ?? '',
    billingType: '',
    defaultRate: '',
    currency: '',
    paymentTermDays: '',
  })

  function openDialog() {
    setEditData({
      contactName: clientContactName ?? '',
      company: clientCompany ?? '',
      email: clientEmail ?? '',
      phone: clientPhone ?? '',
      address: clientAddress ?? '',
      billingType: '',
      defaultRate: '',
      currency: '',
      paymentTermDays: '',
    })
    setError(null)
    setOpen(true)
  }

  const displayedClientName = clientContactName?.trim() || workspaceName

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && saving) return
    setOpen(nextOpen)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: {
          contactName: editData.contactName.trim() || null,
          company: editData.company.trim() || null,
          email: editData.email.trim() || null,
          phone: editData.phone.trim() || null,
          address: editData.address.trim() || null,
        },
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Failed to save')
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <div className="mb-6 rounded-lg border bg-muted/20 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">On the invoice</h3>
          <p className="text-[11px] text-muted-foreground">
            This is what will appear on the final invoice.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* From */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                From
              </span>
              <Link
                href="/settings#business-profile"
                className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Update in Settings →
              </Link>
            </div>
            <div className="space-y-1.5">
              <PreviewRow label="Name" value={fromName} />
              <PreviewRow label="Address" value={fromAddress} flagged />
              <PreviewRow label="Email" value={fromEmail} flagged />
              <PreviewRow label="Phone" value={fromPhone} />
              <PreviewRow label="Website" value={fromWebsite} />
              <PreviewRow label="VAT" value={fromVatNumber} />
            </div>
          </div>

          {/* Bill to */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Bill to
              </span>
              <button
                type="button"
                onClick={openDialog}
                className="text-[10px] text-primary hover:underline"
              >
                Edit
              </button>
            </div>
            <div className="space-y-1.5">
              <PreviewRow label="Name" value={displayedClientName} />
              <PreviewRow label="Company" value={clientCompany} />
              <PreviewRow label="Address" value={clientAddress} flagged />
              <PreviewRow label="Email" value={clientEmail} />
              <PreviewRow label="Phone" value={clientPhone} />
            </div>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit client details</DialogTitle>
          </DialogHeader>

          <ClientProfileForm data={editData} onChange={setEditData} />

          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

          <DialogFooter className="mt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
