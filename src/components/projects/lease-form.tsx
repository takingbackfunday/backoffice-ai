'use client'

import { useState } from 'react'

interface UnitOption { id: string; unitLabel: string }
interface TenantOption { id: string; name: string; email: string }

interface Props {
  projectId: string
  units: UnitOption[]
  tenants: TenantOption[]
  preselectedUnitId?: string
  onCreated: (lease: unknown) => void
  onCancel: () => void
}

export function LeaseForm({ projectId, units, tenants, preselectedUnitId, onCreated, onCancel }: Props) {
  const [unitId, setUnitId] = useState(preselectedUnitId ?? '')
  const [tenantId, setTenantId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [securityDeposit, setSecurityDeposit] = useState('')
  const [paymentDueDay, setPaymentDueDay] = useState('1')
  const [lateFeeAmount, setLateFeeAmount] = useState('')
  const [lateFeeGraceDays, setLateFeeGraceDays] = useState('5')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!unitId || !tenantId || !startDate || !endDate || !monthlyRent) {
      setError('Please fill in all required fields')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId, tenantId, startDate, endDate,
          monthlyRent: parseFloat(monthlyRent),
          securityDeposit: securityDeposit ? parseFloat(securityDeposit) : undefined,
          paymentDueDay: parseInt(paymentDueDay),
          lateFeeAmount: lateFeeAmount ? parseFloat(lateFeeAmount) : undefined,
          lateFeeGraceDays: parseInt(lateFeeGraceDays),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Failed to create lease')
        return
      }
      onCreated(json.data)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Unit <span className="text-destructive">*</span></label>
          <select
            value={unitId}
            onChange={e => setUnitId(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Select unit…</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.unitLabel}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tenant <span className="text-destructive">*</span></label>
          <select
            value={tenantId}
            onChange={e => setTenantId(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Select tenant…</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Start date <span className="text-destructive">*</span></label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">End date <span className="text-destructive">*</span></label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Monthly rent <span className="text-destructive">*</span></label>
          <input
            type="number"
            value={monthlyRent}
            onChange={e => setMonthlyRent(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="0.00"
            min="0"
            step="0.01"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Security deposit</label>
          <input
            type="number"
            value={securityDeposit}
            onChange={e => setSecurityDeposit(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Payment due day</label>
          <input
            type="number"
            value={paymentDueDay}
            onChange={e => setPaymentDueDay(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            min="1"
            max="28"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Late fee</label>
          <input
            type="number"
            value={lateFeeAmount}
            onChange={e => setLateFeeAmount(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Grace days</label>
          <input
            type="number"
            value={lateFeeGraceDays}
            onChange={e => setLateFeeGraceDays(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            min="0"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Creating…' : 'Create lease'}
        </button>
      </div>
    </form>
  )
}
