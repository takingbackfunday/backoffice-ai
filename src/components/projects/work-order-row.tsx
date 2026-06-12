'use client'

import Link from 'next/link'
import { Plus, ChevronDown, ChevronUp, FileText, ExternalLink, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_COLORS,
  BILL_STATUS_LABELS,
  BILL_STATUS_COLORS,
} from '@/types'
import { toDisplay } from '@/lib/money'
import { VendorCreateInline } from './vendor-create-inline'

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

interface BillForm {
  billNumber: string; amount: string; issueDate: string; dueDate: string; notes: string
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const WO_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'BILLED', 'PAID', 'CANCELLED'] as const
const BILL_STATUSES = ['RECEIVED', 'APPROVED', 'PAID', 'VOID'] as const

interface Props {
  wo: WorkOrder
  expanded: boolean
  onToggle: () => void
  onUpdateStatus: (status: string) => void
  onDelete: () => void
  // Vendor picker
  vendorsList: Vendor[]
  creatingVendor: boolean
  newVendorName: string
  onNewVendorNameChange: (v: string) => void
  newVendorSpecialty: string
  onNewVendorSpecialtyChange: (v: string) => void
  savingVendor: boolean
  onCreateVendor: () => void
  onCancelCreateVendor: () => void
  onSelectNewVendor: () => void
  onVendorChange: (vendorId: string) => void
  // Bills
  woBilled: number
  showBillForm: boolean
  billForm: BillForm
  onBillFormChange: (updater: (p: BillForm) => BillForm) => void
  savingBill: boolean
  uploadingBill: boolean
  onBillFileChange: (f: File | null) => void
  onSubmitBill: (e: React.FormEvent) => void
  onShowBillForm: () => void
  onHideBillForm: () => void
  onUpdateBillStatus: (billId: string, status: string) => void
  onDeleteBill: (billId: string) => void
  // Txn picker
  txnPickerBillId: string | null
  unlinkedTxns: Transaction[]
  loadingTxns: boolean
  onOpenTxnPicker: (billId: string) => void
  onCloseTxnPicker: () => void
  onLinkTransaction: (billId: string, transactionId: string) => void
}

export function WorkOrderRow({
  wo, expanded, onToggle, onUpdateStatus, onDelete,
  vendorsList, creatingVendor, newVendorName, onNewVendorNameChange,
  newVendorSpecialty, onNewVendorSpecialtyChange, savingVendor,
  onCreateVendor, onCancelCreateVendor, onSelectNewVendor, onVendorChange,
  woBilled, showBillForm, billForm, onBillFormChange, savingBill,
  uploadingBill, onBillFileChange, onSubmitBill, onShowBillForm,
  onHideBillForm, onUpdateBillStatus, onDeleteBill,
  txnPickerBillId, unlinkedTxns, loadingTxns, onOpenTxnPicker,
  onCloseTxnPicker, onLinkTransaction,
}: Props) {
  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Collapsed row */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/20"
        onClick={onToggle}
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
            <span className="text-xs text-muted-foreground tabular-nums">{fmt(toDisplay(wo.agreedCost))}</span>
          )}
          {woBilled > 0 && (
            <span className="text-xs tabular-nums font-medium">{fmt(woBilled)}</span>
          )}
          <select
            value={wo.status}
            onChange={e => { e.stopPropagation(); onUpdateStatus(e.target.value) }}
            onClick={e => e.stopPropagation()}
            className={cn('text-xs px-1.5 py-0.5 rounded-full border-0 font-medium cursor-pointer', WORK_ORDER_STATUS_COLORS[wo.status] ?? 'bg-muted')}
          >
            {WO_STATUSES.map(s => (
              <option key={s} value={s}>{WORK_ORDER_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-muted-foreground hover:text-red-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded: bills + vendor picker */}
      {expanded && (
        <div className="border-t bg-muted/10 px-4 py-3 space-y-3">
          {/* Vendor picker */}
          <div className="flex items-start gap-2">
            <span className="text-xs text-muted-foreground w-14 shrink-0 pt-1.5">Vendor</span>
            {creatingVendor ? (
              <VendorCreateInline
                name={newVendorName}
                onNameChange={onNewVendorNameChange}
                specialty={newVendorSpecialty}
                onSpecialtyChange={onNewVendorSpecialtyChange}
                saving={savingVendor}
                onCreate={onCreateVendor}
                onCancel={onCancelCreateVendor}
              />
            ) : (
              <select
                value={wo.vendor?.id ?? ''}
                onChange={e => {
                  if (e.target.value === '__new__') onSelectNewVendor()
                  else onVendorChange(e.target.value)
                }}
                className="text-xs rounded border px-2 py-1 bg-background flex-1 max-w-xs"
              >
                <option value="">— Unassigned —</option>
                {vendorsList.map(v => (
                  <option key={v.id} value={v.id}>{v.name}{v.specialty ? ` (${v.specialty})` : ''}</option>
                ))}
                <option value="__new__">+ New vendor…</option>
              </select>
            )}
          </div>
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
                      <span className="font-medium tabular-nums">{fmt(toDisplay(bill.amount))}</span>
                      <select
                        value={bill.status}
                        onChange={e => onUpdateBillStatus(bill.id, e.target.value)}
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
                      <button type="button" onClick={() => onDeleteBill(bill.id)} className="text-muted-foreground hover:text-red-600">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {/* Transaction picker */}
                  {!bill.transaction ? (
                    txnPickerBillId === bill.id ? (
                      <div className="pt-1 border-t space-y-1">
                        {loadingTxns ? (
                          <p className="text-muted-foreground">Loading transactions…</p>
                        ) : unlinkedTxns.length === 0 ? (
                          <p className="text-muted-foreground">No unlinked transactions in this workspace.</p>
                        ) : (
                          <select
                            onChange={e => e.target.value && onLinkTransaction(bill.id, e.target.value)}
                            defaultValue=""
                            className="w-full rounded border px-2 py-1 text-xs bg-background"
                          >
                            <option value="">— Pick a transaction —</option>
                            {unlinkedTxns.map(t => (
                              <option key={t.id} value={t.id}>
                                {fmtDate(t.date)} · {fmt(toDisplay(t.amount))} · {t.description}
                              </option>
                            ))}
                          </select>
                        )}
                        <button type="button" onClick={onCloseTxnPicker} className="text-muted-foreground hover:text-foreground">Cancel</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenTxnPicker(bill.id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Link transaction
                      </button>
                    )
                  ) : (
                    <p className="text-muted-foreground">
                      {fmtDate(bill.transaction.date)} · {fmt(toDisplay(bill.transaction.amount))} · {bill.transaction.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add bill form */}
          {showBillForm ? (
            <form onSubmit={onSubmitBill} className="space-y-3 bg-background rounded border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">Add bill</p>
                {wo.vendor && (
                  <span className="text-xs text-muted-foreground">Vendor: <span className="font-medium text-foreground">{wo.vendor.name}</span></span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Bill # (optional)</label>
                  <input
                    value={billForm.billNumber}
                    onChange={e => onBillFormChange(p => ({ ...p, billNumber: e.target.value }))}
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
                    onChange={e => onBillFormChange(p => ({ ...p, amount: e.target.value }))}
                    required
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Issue date *</label>
                  <input
                    type="date"
                    value={billForm.issueDate}
                    onChange={e => onBillFormChange(p => ({ ...p, issueDate: e.target.value }))}
                    required
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Due date</label>
                  <input
                    type="date"
                    value={billForm.dueDate}
                    onChange={e => onBillFormChange(p => ({ ...p, dueDate: e.target.value }))}
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">PDF (optional)</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={e => onBillFileChange(e.target.files?.[0] ?? null)}
                    className="mt-0.5 w-full text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onHideBillForm} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                <button
                  type="submit"
                  disabled={savingBill || uploadingBill}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {uploadingBill ? 'Uploading…' : savingBill ? 'Saving…' : 'Add bill'}
                </button>
              </div>
            </form>
          ) : wo.vendor ? (
            <button
              type="button"
              onClick={onShowBillForm}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-3 h-3" /> Add bill
            </button>
          ) : (
            <p className="text-xs text-muted-foreground italic">Assign a vendor above to add bills.</p>
          )}
        </div>
      )}
    </div>
  )
}
