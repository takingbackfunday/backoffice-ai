'use client'

import { VendorCreateInline } from './vendor-create-inline'

interface Vendor { id: string; name: string; specialty: string | null }

interface WoForm {
  title: string; description: string; vendorId: string; agreedCost: string; scheduledDate: string
}

interface Props {
  woForm: WoForm
  onWoFormChange: (updater: (p: WoForm) => WoForm) => void
  savingWo: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  vendorsList: Vendor[]
  creatingVendor: boolean
  onSelectNewVendor: () => void
  onSelectVendor: (vendorId: string) => void
  newVendorName: string
  onNewVendorNameChange: (v: string) => void
  newVendorSpecialty: string
  onNewVendorSpecialtyChange: (v: string) => void
  savingVendor: boolean
  onCreateVendor: () => void
  onCancelCreateVendor: () => void
}

export function WorkOrderNewForm({
  woForm, onWoFormChange, savingWo, onSubmit, onCancel,
  vendorsList, creatingVendor, onSelectNewVendor, onSelectVendor,
  newVendorName, onNewVendorNameChange,
  newVendorSpecialty, onNewVendorSpecialtyChange,
  savingVendor, onCreateVendor, onCancelCreateVendor,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="mb-4 rounded-lg border p-4 space-y-3">
      <h4 className="text-xs font-semibold">Create work order</h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Title *</label>
          <input
            value={woForm.title}
            onChange={e => onWoFormChange(p => ({ ...p, title: e.target.value }))}
            required
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
            placeholder="Mixing & mastering, Boiler repair…"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Vendor</label>
          {creatingVendor ? (
            <div className="mt-0.5 space-y-1">
              <VendorCreateInline
                name={newVendorName}
                onNameChange={onNewVendorNameChange}
                specialty={newVendorSpecialty}
                onSpecialtyChange={onNewVendorSpecialtyChange}
                saving={savingVendor}
                onCreate={onCreateVendor}
                onCancel={onCancelCreateVendor}
              />
            </div>
          ) : (
            <select
              value={woForm.vendorId}
              onChange={e => {
                if (e.target.value === '__new__') onSelectNewVendor()
                else onSelectVendor(e.target.value)
              }}
              className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
            >
              <option value="">— Unassigned —</option>
              {vendorsList.map(v => (
                <option key={v.id} value={v.id}>{v.name}{v.specialty ? ` (${v.specialty})` : ''}</option>
              ))}
              <option value="__new__">+ New vendor…</option>
            </select>
          )}
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Agreed cost</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={woForm.agreedCost}
            onChange={e => onWoFormChange(p => ({ ...p, agreedCost: e.target.value }))}
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Scheduled date</label>
          <input
            type="date"
            value={woForm.scheduledDate}
            onChange={e => onWoFormChange(p => ({ ...p, scheduledDate: e.target.value }))}
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Description</label>
        <textarea
          value={woForm.description}
          onChange={e => onWoFormChange(p => ({ ...p, description: e.target.value }))}
          rows={2}
          className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm bg-background resize-none"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        <button
          type="submit"
          disabled={savingWo}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {savingWo ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  )
}
