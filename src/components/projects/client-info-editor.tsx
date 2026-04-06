'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClientProfileForm } from '@/components/projects/client-profile-form'

interface Props {
  projectId: string
  isDefault?: boolean
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

export function ClientInfoEditor({ projectId, isDefault = false, profile }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      router.push('/projects')
    } finally {
      setDeleting(false)
    }
  }
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

        {!isDefault && (
          <div className="mt-6 border border-destructive/30 rounded-md p-3">
            <p className="text-xs font-medium text-destructive mb-2">Danger zone</p>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">This will permanently delete the project and all its data.</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded px-2 py-1 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded px-2 py-1 text-xs font-medium border hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-destructive hover:underline"
              >
                Delete this project
              </button>
            )}
          </div>
        )}
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
      </dl>
    </div>
  )
}
