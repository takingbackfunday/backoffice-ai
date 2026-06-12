'use client'

import { Plus } from 'lucide-react'
import { toDisplay } from '@/lib/money'
import { fmt } from '@/components/studio/studio-shared'
import { useUploadThing } from '@/lib/uploadthing-client'
import { useWorkOrders } from './hooks/use-work-orders'
import { WorkOrderRow } from './work-order-row'
import { WorkOrderNewForm } from './work-order-new-form'

interface Vendor { id: string; name: string; specialty: string | null }
interface Bill {
  id: string; amount: string | number; status: string; issueDate: string
  billNumber: string | null; fileUrl: string | null; fileName: string | null; notes: string | null
  dueDate: string | null
  transaction: { id: string; date: string; amount: string | number; description: string } | null
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

export function WorkOrderPanel({ projectId, workOrders: initial, vendors, context }: Props) {
  const hook = useWorkOrders(initial, vendors, projectId, context)
  const { startUpload } = useUploadThing('billPdf')

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Work orders</h3>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{hook.workOrders.length}</span>
          {hook.totalCosts > 0 && (
            <span className="text-xs text-muted-foreground">· {fmt(hook.totalCosts)} total costs</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => hook.setShowWoForm(v => !v)}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New work order
        </button>
      </div>

      {hook.showWoForm && (
        <WorkOrderNewForm
          woForm={hook.woForm}
          onWoFormChange={fn => hook.setWoForm(fn)}
          savingWo={hook.savingWo}
          onSubmit={hook.createWorkOrder}
          onCancel={() => hook.setShowWoForm(false)}
          vendorsList={hook.vendorsList}
          creatingVendor={hook.woFormCreatingVendor}
          onSelectNewVendor={() => { hook.setWoFormCreatingVendor(true); hook.setWoForm(p => ({ ...p, vendorId: '' })) }}
          onSelectVendor={vendorId => hook.setWoForm(p => ({ ...p, vendorId }))}
          newVendorName={hook.newVendorName}
          onNewVendorNameChange={hook.setNewVendorName}
          newVendorSpecialty={hook.newVendorSpecialty}
          onNewVendorSpecialtyChange={hook.setNewVendorSpecialty}
          savingVendor={hook.savingVendor}
          onCreateVendor={() => hook.handleCreateVendor('form')}
          onCancelCreateVendor={() => { hook.setWoFormCreatingVendor(false); hook.setNewVendorName(''); hook.setNewVendorSpecialty('') }}
        />
      )}

      {hook.workOrders.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
          No work orders yet.
        </div>
      ) : (
        <div className="space-y-2">
          {hook.workOrders.map(wo => {
            const woBilled = wo.bills.reduce((s, b) => s + toDisplay(b.amount), 0)
            return (
              <WorkOrderRow
                key={wo.id}
                wo={wo}
                expanded={hook.expandedWo === wo.id}
                onToggle={() => hook.setExpandedWo(hook.expandedWo === wo.id ? null : wo.id)}
                onUpdateStatus={status => hook.updateWoStatus(wo.id, status)}
                onDelete={() => hook.deleteWorkOrder(wo.id)}
                vendorsList={hook.vendorsList}
                creatingVendor={hook.panelCreatingVendorForWoId === wo.id}
                newVendorName={hook.newVendorName}
                onNewVendorNameChange={hook.setNewVendorName}
                newVendorSpecialty={hook.newVendorSpecialty}
                onNewVendorSpecialtyChange={hook.setNewVendorSpecialty}
                savingVendor={hook.savingVendor}
                onCreateVendor={() => hook.handleCreateVendor(wo.id)}
                onCancelCreateVendor={() => { hook.setPanelCreatingVendorForWoId(null); hook.setNewVendorName(''); hook.setNewVendorSpecialty('') }}
                onSelectNewVendor={() => { hook.setPanelCreatingVendorForWoId(wo.id); hook.setNewVendorName(''); hook.setNewVendorSpecialty('') }}
                onVendorChange={vendorId => hook.updateWoVendor(wo.id, vendorId || null)}
                woBilled={woBilled}
                showBillForm={hook.showBillForm === wo.id}
                billForm={hook.billForm}
                onBillFormChange={fn => hook.setBillForm(fn)}
                savingBill={hook.savingBill}
                uploadingBill={hook.uploadingBill}
                onBillFileChange={hook.setBillFile}
                onSubmitBill={e => hook.createBill(e, wo.id, startUpload)}
                onShowBillForm={() => hook.setShowBillForm(wo.id)}
                onHideBillForm={() => hook.setShowBillForm(null)}
                onUpdateBillStatus={(billId, status) => hook.updateBillStatus(wo.id, billId, status)}
                onDeleteBill={billId => hook.deleteBill(wo.id, billId)}
                txnPickerBillId={hook.txnPickerBillId?.billId ?? null}
                unlinkedTxns={hook.unlinkedTxns}
                loadingTxns={hook.loadingTxns}
                onOpenTxnPicker={billId => hook.openTxnPicker(wo.id, billId)}
                onCloseTxnPicker={() => hook.setTxnPickerBillId(null)}
                onLinkTransaction={(billId, transactionId) => hook.linkTransaction(wo.id, billId, transactionId)}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
