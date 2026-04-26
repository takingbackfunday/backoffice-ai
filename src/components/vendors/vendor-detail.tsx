'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, FileText, Trash2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WORK_ORDER_STATUS_LABELS, WORK_ORDER_STATUS_COLORS, BILL_STATUS_LABELS, BILL_STATUS_COLORS, VENDOR_DOCUMENT_TYPE_LABELS } from '@/types'
import { useUploadThing } from '@/lib/uploadthing-client'

interface Transaction { id: string; date: string; amount: string | number; description: string }
interface Bill {
  id: string; amount: string | number; status: string; issueDate: string; billNumber: string | null
  fileUrl: string | null; fileName: string | null; transaction: Transaction | null
  workOrder: { id: string; title: string } | null
}
interface WorkOrder {
  id: string; title: string; status: string; agreedCost: string | number | null
  scheduledDate: string | null
  vendor: { id: string; name: string } | null
  workspace: { id: string; name: string; slug: string }
  job: { id: string; name: string } | null
  maintenanceRequest: { id: string; title: string } | null
  bills: Bill[]
}
interface VendorDoc {
  id: string; fileType: string; fileName: string; fileUrl: string; expiresAt: string | null; notes: string | null
}
interface Vendor {
  id: string; name: string; email: string | null; phone: string | null; taxId: string | null
  specialty: string | null; notes: string | null
  documents: VendorDoc[]
  workOrders: WorkOrder[]
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function VendorDetail({ vendor: initial }: { vendor: Vendor }) {
  const [vendor, setVendor] = useState<Vendor>(initial)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({ name: initial.name, email: initial.email ?? '', phone: initial.phone ?? '', taxId: initial.taxId ?? '', specialty: initial.specialty ?? '', notes: initial.notes ?? '' })
  const [saving, setSaving] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [docForm, setDocForm] = useState({ fileType: 'W9' as string, notes: '', expiresAt: '' })
  const [uploading, setUploading] = useState(false)
  const [docFile, setDocFile] = useState<File | null>(null)

  const { startUpload } = useUploadThing('vendorDocument')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const json = await res.json()
        setVendor(prev => ({ ...prev, ...json.data }))
        setEditMode(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteDoc(docId: string) {
    const res = await fetch(`/api/vendors/${vendor.id}/documents/${docId}`, { method: 'DELETE' })
    if (res.ok) {
      setVendor(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== docId) }))
    }
  }

  async function handleUploadDoc(e: React.FormEvent) {
    e.preventDefault()
    if (!docFile) return
    setUploading(true)
    try {
      const uploaded = await startUpload([docFile])
      if (!uploaded?.[0]) return
      const res = await fetch(`/api/vendors/${vendor.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileType: docForm.fileType,
          fileName: docFile.name,
          fileUrl: uploaded[0].url,
          fileSize: docFile.size,
          expiresAt: docForm.expiresAt || undefined,
          notes: docForm.notes || undefined,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        setVendor(prev => ({ ...prev, documents: [json.data, ...prev.documents] }))
        setShowDocForm(false)
        setDocFile(null)
        setDocForm({ fileType: 'W9', notes: '', expiresAt: '' })
      }
    } finally {
      setUploading(false)
    }
  }

  const totalPaid = vendor.workOrders
    .flatMap(wo => wo.bills)
    .filter(b => b.status === 'PAID')
    .reduce((s, b) => s + Number(b.amount), 0)

  return (
    <div className="max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{vendor.name}</h2>
          {vendor.specialty && <p className="text-sm text-muted-foreground">{vendor.specialty}</p>}
        </div>
        <button
          type="button"
          onClick={() => setEditMode(v => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {editMode ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {/* Edit form */}
      {editMode && (
        <form onSubmit={handleSave} className="rounded-lg border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'name', label: 'Name *', placeholder: '' },
              { key: 'specialty', label: 'Specialty', placeholder: 'Plumbing, Audio Mixing…' },
              { key: 'email', label: 'Email', placeholder: '' },
              { key: 'phone', label: 'Phone', placeholder: '' },
              { key: 'taxId', label: 'Tax ID / EIN', placeholder: '' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground">{label}</label>
                <input
                  value={(form as Record<string, string>)[key]}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background resize-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {/* Contact info */}
      {!editMode && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {vendor.email && <span className="text-muted-foreground">Email: <span className="text-foreground">{vendor.email}</span></span>}
          {vendor.phone && <span className="text-muted-foreground">Phone: <span className="text-foreground">{vendor.phone}</span></span>}
          {vendor.taxId && <span className="text-muted-foreground">Tax ID: <span className="text-foreground">{vendor.taxId}</span></span>}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Work orders</p>
          <p className="text-sm font-semibold">{vendor.workOrders.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Total billed</p>
          <p className="text-sm font-semibold">{fmt(vendor.workOrders.flatMap(wo => wo.bills).reduce((s, b) => s + Number(b.amount), 0))}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Total paid</p>
          <p className="text-sm font-semibold">{fmt(totalPaid)}</p>
        </div>
      </div>

      {/* Document vault */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Document vault</h3>
          <button
            type="button"
            onClick={() => setShowDocForm(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-3 h-3" /> Add document
          </button>
        </div>

        {showDocForm && (
          <form onSubmit={handleUploadDoc} className="mb-4 rounded-lg border p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Document type</label>
                <select
                  value={docForm.fileType}
                  onChange={e => setDocForm(p => ({ ...p, fileType: e.target.value }))}
                  className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                >
                  {Object.entries(VENDOR_DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Expiry date (optional)</label>
                <input
                  type="date"
                  value={docForm.expiresAt}
                  onChange={e => setDocForm(p => ({ ...p, expiresAt: e.target.value }))}
                  className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">File (PDF)</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={e => setDocFile(e.target.files?.[0] ?? null)}
                className="mt-0.5 w-full text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowDocForm(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              <button
                type="submit"
                disabled={uploading || !docFile}
                className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </form>
        )}

        {vendor.documents.length === 0 && !showDocForm ? (
          <p className="text-sm text-muted-foreground">No documents on file.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="text-left px-3 py-2 font-medium">File</th>
                  <th className="text-left px-3 py-2 font-medium">Expiry</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {vendor.documents.map(doc => {
                  const expired = doc.expiresAt && new Date(doc.expiresAt) < new Date()
                  return (
                    <tr key={doc.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{VENDOR_DOCUMENT_TYPE_LABELS[doc.fileType] ?? doc.fileType}</td>
                      <td className="px-3 py-2">
                        <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline text-blue-600">
                          <FileText className="w-3 h-3" />
                          {doc.fileName}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="px-3 py-2">
                        {doc.expiresAt ? (
                          <span className={cn('text-xs px-2 py-0.5 rounded-full', expired ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800')}>
                            {expired ? 'Expired ' : ''}{fmtDate(doc.expiresAt)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => handleDeleteDoc(doc.id)} className="text-muted-foreground hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Work orders / payment history */}
      <section>
        <h3 className="text-sm font-semibold mb-3">Work orders</h3>
        {vendor.workOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No work orders yet.</p>
        ) : (
          <div className="space-y-3">
            {vendor.workOrders.map(wo => (
              <div key={wo.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="text-sm font-medium">{wo.title}</p>
                    <p className="text-xs text-muted-foreground">
                      <Link href={`/projects/${wo.workspace.slug}`} className="hover:underline">{wo.workspace.name}</Link>
                      {wo.job && <> · <Link href={`/projects/${wo.workspace.slug}/jobs/${wo.job.id}`} className="hover:underline">{wo.job.name}</Link></>}
                    </p>
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0', WORK_ORDER_STATUS_COLORS[wo.status] ?? 'bg-muted')}>
                    {WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status}
                  </span>
                </div>
                {wo.agreedCost && (
                  <p className="text-xs text-muted-foreground mb-2">Agreed: {fmt(Number(wo.agreedCost))}</p>
                )}
                {wo.bills.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {wo.bills.map(bill => (
                      <div key={bill.id} className="flex items-center justify-between text-xs pl-3 border-l-2 border-muted">
                        <span className="text-muted-foreground">
                          {bill.billNumber ?? 'Bill'} · {fmtDate(bill.issueDate)}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{fmt(Number(bill.amount))}</span>
                          <span className={cn('px-1.5 py-0.5 rounded-full', BILL_STATUS_COLORS[bill.status] ?? 'bg-muted')}>
                            {BILL_STATUS_LABELS[bill.status] ?? bill.status}
                          </span>
                          {bill.fileUrl && (
                            <a href={bill.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">PDF</a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
