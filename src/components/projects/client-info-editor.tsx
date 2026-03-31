'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClientProfileForm } from '@/components/projects/client-profile-form'
import { BILLING_TYPE_LABELS } from '@/types'

interface Props {
  projectId: string
  profile: {
    contactName: string | null
    company: string | null
    email: string | null
    phone: string | null
    address: string | null
    billingType: string
    defaultRate: number | null
    currency: string
    paymentTermDays: number
  }
}

export function ClientInfoEditor({ projectId, profile }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState({
    contactName: profile.contactName ?? '',
    company: profile.company ?? '',
    email: profile.email ?? '',
    phone: profile.phone ?? '',
    address: profile.address ?? '',
    billingType: profile.billingType,
    defaultRate: profile.defaultRate?.toString() ?? '',
    currency: profile.currency,
    paymentTermDays: profile.paymentTermDays.toString(),
  })

  async function handleSave() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: {
          contactName: data.contactName || undefined,
          company: data.company || undefined,
          email: data.email || undefined,
          phone: data.phone || undefined,
          address: data.address || undefined,
          billingType: data.billingType,
          defaultRate: data.defaultRate ? parseFloat(data.defaultRate) : undefined,
          currency: data.currency,
          paymentTermDays: parseInt(data.paymentTermDays) || 30,
        },
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Failed to save')
      return
    }
    setEditing(false)
    router.refresh()
  }

  if (editing) {
    return (
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Client info</h2>
        </div>
        <ClientProfileForm data={data} onChange={setData} />
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => { setEditing(false); setError(null) }}
            disabled={saving}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Client info</h2>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-primary hover:underline"
        >
          Edit
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        {profile.contactName && (<><dt className="text-muted-foreground">Contact</dt><dd>{profile.contactName}</dd></>)}
        {profile.company && (<><dt className="text-muted-foreground">Company</dt><dd>{profile.company}</dd></>)}
        {profile.email && (<><dt className="text-muted-foreground">Email</dt><dd>{profile.email}</dd></>)}
        {profile.phone && (<><dt className="text-muted-foreground">Phone</dt><dd>{profile.phone}</dd></>)}
        {profile.address && (<><dt className="text-muted-foreground">Address</dt><dd>{profile.address}</dd></>)}
        <dt className="text-muted-foreground">Billing</dt>
        <dd>{BILLING_TYPE_LABELS[profile.billingType] ?? profile.billingType}</dd>
        <dt className="text-muted-foreground">Currency</dt>
        <dd>{profile.currency}</dd>
        <dt className="text-muted-foreground">Payment terms</dt>
        <dd>{profile.paymentTermDays} days</dd>
      </dl>
    </div>
  )
}
