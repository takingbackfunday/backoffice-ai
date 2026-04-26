'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, ChevronDown, ChevronUp, FileText, ExternalLink, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_COLORS,
  BILL_STATUS_LABELS,
  BILL_STATUS_COLORS,
} from '@/types'
import { useUploadThing } from '@/lib/uploadthing-client'

interface Vendor { id: string; name: string; specialty: string | null }
interface Transaction { id: string; date: string; amount: string | number; description: string }
interface Bill {
  id: string; amount: string | number; status: string; issueDate: string
  billNumber: string | null; fileUrl: string | null; fileName: string | null; notes: string | null
  dueDate: string | null
  transaction: Transaction | null
}
interface WorkOrder {
  id: string; title: string; description: string | null; status: string
  agreedCost: string | number | null; scheduledDate: string | null
  vendor: Vendor | null
  bills: Bill[]
}
interface WorkOrderContext {
  type: 'job' | 'maintenance'
  jobId?: string
  maintenanceRequestId?: string
}

interface Props {
  projectId: string
  workOrders: WorkOrder[]
  vendors: Vendor[]
  context: WorkOrderContext
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const WO_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'BILLED', 'PAID', 'CANCELLED'] as const
const BILL_STATUSES = ['RECEIVED', 'APPROVED', 'PAID', 'VOID'] as const

export function WorkOrderPanel({ projectId, workOrders: initial, vendors, context }: Props) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initial)
  const [showWoForm, setShowWoForm] = useState(false)
  const [savingWo, setSavingWo] = useState(false)
  const [expandedWo, setExpandedWo] = useState<string | null>(null)
  const [showBillForm, setShowBillForm] = useState<string | null>(null)
  const [savingBill, setSavingBill] = useState(false)
  const [uploadingBill, setUploadingBill] = useState(false)
  const [billFile, setBillFile] = useState<File | null>(null)
  const [txnPickerBillId, setTxnPickerBillId] = useState<{ woId: string; billId: string } | null>(null)
  const [unlinkedTxns, setUnlinkedTxns] = useState<Transaction[]>([])
  const [loadingTxns, setLoadingTxns] = useState(false)

  const [woForm, setWoForm] = useState({
    title: '', description: '', vendorId: '', agreedCost: '', scheduledDate: '',
  })
  const [billForm, setBillForm] = useState({
    vendorId: '', billNumber: '', amount: '', issueDate: '', dueDate: '', notes: '',
  })

  const { startUpload } = useUploadThing('billPdf')

  async function createWorkOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!woForm.title.trim()) return
    setSavingWo(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/work-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: woForm.title,
          description: woForm.description || undefined,
          vendorId: woForm.vendorId || undefined,
          agreedCost: woForm.agreedCost ? Number(woForm.agreedCost) : undefined,
          scheduledDate: woForm.scheduledDate || undefined,
          ...(context.type === 'job' ? { jobId: context.jobId } : { maintenanceRequestId: context.maintenanceRequestId }),
        }),
      })
      if (res.ok) {
        const json = await res.json()
        setWorkOrders(prev => [json.data, ...prev])
        setWoForm({ title: '', description: '', vendorId: '', agreedCost: '', scheduledDate: '' })
        setShowWoForm(false)
      }
    } finally {
      setSavingWo(false)
    }
  }

  async function updateWoStatus(woId: string, status: string) {
    const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const json = await res.json()
      setWorkOrders(prev => prev.map(wo => wo.id === woId ? json.data : wo))
    }
  }

  async function deleteWorkOrder(woId: string) {
    if (!confirm('Delete this work order and all its bills?')) return
    const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}`, { method: 'DELETE' })
    if (res.ok) {
      setWorkOrders(prev => prev.filter(wo => wo.id !== woId))
    }
  }

  async function createBill(e: React.FormEvent, woId: string) {
    e.preventDefault()
    if (!billForm.amount || !billForm.issueDate || !billForm.vendorId) return
    setSavingBill(true)
    try {
      let fileUrl: string | undefined
      let fileName: string | undefined
      if (billFile) {
        setUploadingBill(true)
        const uploaded = await startUpload([billFile])
        setUploadingBill(false)
        if (uploaded?.[0]) {
          fileUrl = uploaded[0].url
          fileName = billFile.name
        }
      }
      const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: billForm.vendorId,
          billNumber: billForm.billNumber || undefined,
          amount: Number(billForm.amount),
          issueDate: billForm.issueDate,
          dueDate: billForm.dueDate || undefined,
          notes: billForm.notes || undefined,
          fileUrl,
          fileName,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        setWorkOrders(prev => prev.map(wo =>
          wo.id === woId ? { ...wo, bills: [json.data, ...wo.bills], status: 'BILLED' } : wo
        ))
        setBillForm({ vendorId: '', billNumber: '', amount: '', issueDate: '', dueDate: '', notes: '' })
        setBillFile(null)
        setShowBillForm(null)
      }
    } finally {
      setSavingBill(false)
      setUploadingBill(false)
    }
  }

  async function updateBillStatus(woId: string, billId: string, status: string) {
    const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}/bills/${billId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(status === 'PAID' ? { paidDate: new Date().toISOString() } : {}) }),
    })
    if (res.ok) {
      const json = await res.json()
      setWorkOrders(prev => prev.map(wo =>
        wo.id === woId
          ? { ...wo, bills: wo.bills.map(b => b.id === billId ? json.data : b) }
          : wo
      ))
    }
  }

  async function openTxnPicker(woId: string, billId: string) {
    setTxnPickerBillId({ woId, billId })
    setLoadingTxns(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/unlinked-transactions`)
      if (res.ok) {
        const json = await res.json()
        setUnlinkedTxns(json.data ?? [])
      }
    } finally {
      setLoadingTxns(false)
    }
  }

  async function linkTransaction(woId: string, billId: string, transactionId: string) {
    const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}/bills/${billId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId }),
    })
    if (res.ok) {
      const json = await res.json()
      setWorkOrders(prev => prev.map(wo =>
        wo.id === woId
          ? { ...wo, bills: wo.bills.map(b => b.id === billId ? json.data : b) }
          : wo
      ))
      setTxnPickerBillId(null)
    }
  }

  async function deleteBill(woId: string, billId: string) {
    const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}/bills/${billId}`, { method: 'DELETE' })
    if (res.ok) {
      setWorkOrders(prev => prev.map(wo =>
        wo.id === woId ? { ...wo, bills: wo.bills.filter(b => b.id !== billId) } : wo
      ))
    }
  }

  const totalCosts = workOrders.flatMap(wo => wo.bills).reduce((s, b) => s + Number(b.amount), 0)

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Work orders</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{workOrders.length}</span>
          {totalCosts > 0 && (
            <span className="text-xs text-muted-foreground">· {fmt(totalCosts)} total costs</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowWoForm(v => !v)}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New work order
        </button>
      </div>

      {showWoForm && (
        <form onSubmit={createWorkOrder} className="mb-4 rounded-lg border p-4 space-y-3">
          <h4 className="text-xs font-semibold">Create work order</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Title *</label>
              <input
                value={woForm.title}
                onChange={e => setWoForm(p => ({ ...p, title: e.target.value }))}
                required
                className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                placeholder="Mixing & mastering, Boiler repair…"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Vendor</label>
              <select
                value={woForm.vendorId}
                onChange={e => setWoForm(p => ({ ...p, vendorId: e.target.value }))}
                className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
              >
                <option value="">— Unassigned —</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}{v.specialty ? ` (${v.specialty})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Agreed cost</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={woForm.agreedCost}
                onChange={e => setWoForm(p => ({ ...p, agreedCost: e.target.value }))}
                className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Scheduled date</label>
              <input
                type="date"
                value={woForm.scheduledDate}
                onChange={e => setWoForm(p => ({ ...p, scheduledDate: e.target.value }))}
                className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description</label>
            <textarea
              value={woForm.description}
              onChange={e => setWoForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowWoForm(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            <button
              type="submit"
              disabled={savingWo}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingWo ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {workOrders.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
          No work orders yet.
        </div>
      ) : (
        <div className="space-y-2">
          {workOrders.map(wo => {
            const expanded = expandedWo === wo.id
            const woBilled = wo.bills.reduce((s, b) => s + Number(b.amount), 0)
            return (
              <div key={wo.id} className="rounded-lg border overflow-hidden">
                {/* Work order row */}
                <div
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/20"
                  onClick={() => setExpandedWo(expanded ? null : wo.id)}
                >
                  <button type="button" className="shrink-0 text-muted-foreground">
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{wo.title}</p>
                    {wo.vendor && (
                      <p className="text-xs text-muted-foreground">
                        <Link href={`/vendors/${wo.vendor.id}`} className="hover:underline" onClick={e => e.stopPropagation()}>
                          {wo.vendor.name}
                        </Link>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {wo.agreedCost && (
                      <span className="text-xs text-muted-foreground tabular-nums">{fmt(Number(wo.agreedCost))}</span>
                    )}
                    {woBilled > 0 && (
                      <span className="text-xs tabular-nums font-medium">{fmt(woBilled)}</span>
                    )}
                    <select
                      value={wo.status}
                      onChange={e => { e.stopPropagation(); updateWoStatus(wo.id, e.target.value) }}
                      onClick={e => e.stopPropagation()}
                      className={cn('text-xs px-1.5 py-0.5 rounded-full border-0 font-medium cursor-pointer', WORK_ORDER_STATUS_COLORS[wo.status] ?? 'bg-muted')}
                    >
                      {WO_STATUSES.map(s => (
                        <option key={s} value={s}>{WORK_ORDER_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); deleteWorkOrder(wo.id) }}
                      className="text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded: bills + add bill form */}
                {expanded && (
                  <div className="border-t bg-muted/10 px-4 py-3 space-y-3">
                    {wo.description && (
                      <p className="text-xs text-muted-foreground">{wo.description}</p>
                    )}

                    {/* Bills list */}
                    {wo.bills.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Bills</p>
                        {wo.bills.map(bill => (
                          <div key={bill.id} className="text-xs bg-background rounded border px-3 py-2 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium">{bill.billNumber ?? 'Bill'}</span>
                                <span className="text-muted-foreground ml-2">{fmtDate(bill.issueDate)}</span>
                                {bill.transaction && (
                                  <span className="text-green-700 ml-2">· txn linked</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium tabular-nums">{fmt(Number(bill.amount))}</span>
                                <select
                                  value={bill.status}
                                  onChange={e => updateBillStatus(wo.id, bill.id, e.target.value)}
                                  className={cn('text-xs px-1.5 py-0.5 rounded-full border-0 font-medium cursor-pointer', BILL_STATUS_COLORS[bill.status] ?? 'bg-muted')}
                                >
                                  {BILL_STATUSES.map(s => (
                                    <option key={s} value={s}>{BILL_STATUS_LABELS[s]}</option>
                                  ))}
                                </select>
                                {bill.fileUrl && (
                                  <a href={bill.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-0.5">
                                    <FileText className="w-3 h-3" />
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                                <button type="button" onClick={() => deleteBill(wo.id, bill.id)} className="text-muted-foreground hover:text-red-600">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            {/* Transaction picker */}
                            {!bill.transaction ? (
                              txnPickerBillId?.billId === bill.id ? (
                                <div className="pt-1 border-t space-y-1">
                                  {loadingTxns ? (
                                    <p className="text-muted-foreground">Loading transactions…</p>
                                  ) : unlinkedTxns.length === 0 ? (
                                    <p className="text-muted-foreground">No unlinked transactions in this workspace.</p>
                                  ) : (
                                    <select
                                      onChange={e => e.target.value && linkTransaction(wo.id, bill.id, e.target.value)}
                                      defaultValue=""
                                      className="w-full rounded border px-2 py-1 text-xs bg-background"
                                    >
                                      <option value="">— Pick a transaction —</option>
                                      {unlinkedTxns.map(t => (
                                        <option key={t.id} value={t.id}>
                                          {fmtDate(t.date)} · {fmt(Number(t.amount))} · {t.description}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  <button type="button" onClick={() => setTxnPickerBillId(null)} className="text-muted-foreground hover:text-foreground">Cancel</button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openTxnPicker(wo.id, bill.id)}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  Link transaction
                                </button>
                              )
                            ) : (
                              <p className="text-muted-foreground">
                                {fmtDate(bill.transaction.date)} · {fmt(Number(bill.transaction.amount))} · {bill.transaction.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add bill form */}
                    {showBillForm === wo.id ? (
                      <form onSubmit={e => createBill(e, wo.id)} className="space-y-3 bg-background rounded border p-3">
                        <p className="text-xs font-medium">Add bill</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Vendor *</label>
                            <select
                              value={billForm.vendorId}
                              onChange={e => setBillForm(p => ({ ...p, vendorId: e.target.value }))}
                              required
                              className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs bg-background"
                            >
                              <option value="">— Select vendor —</option>
                              {vendors.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Bill # (optional)</label>
                            <input
                              value={billForm.billNumber}
                              onChange={e => setBillForm(p => ({ ...p, billNumber: e.target.value }))}
                              className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs bg-background"
                              placeholder="INV-001"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Amount *</label>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={billForm.amount}
                              onChange={e => setBillForm(p => ({ ...p, amount: e.target.value }))}
                              required
                              className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Issue date *</label>
                            <input
                              type="date"
                              value={billForm.issueDate}
                              onChange={e => setBillForm(p => ({ ...p, issueDate: e.target.value }))}
                              required
                              className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Due date</label>
                            <input
                              type="date"
                              value={billForm.dueDate}
                              onChange={e => setBillForm(p => ({ ...p, dueDate: e.target.value }))}
                              className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">PDF (optional)</label>
                            <input
                              type="file"
                              accept="application/pdf"
                              onChange={e => setBillFile(e.target.files?.[0] ?? null)}
                              className="mt-0.5 w-full text-xs"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setShowBillForm(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                          <button
                            type="submit"
                            disabled={savingBill || uploadingBill}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            {uploadingBill ? 'Uploading…' : savingBill ? 'Saving…' : 'Add bill'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setShowBillForm(wo.id); setBillForm(p => ({ ...p, vendorId: wo.vendor?.id ?? '' })) }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="w-3 h-3" /> Add bill
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
