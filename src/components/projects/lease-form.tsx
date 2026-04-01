'use client'

import { useState } from 'react'
import { UserPlus, ChevronDown } from 'lucide-react'

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

export function LeaseForm({ projectId, units, tenants: initialTenants, preselectedUnitId, onCreated, onCancel }: Props) {
  const [unitId, setUnitId] = useState(preselectedUnitId ?? '')
  const [tenantId, setTenantId] = useState('')
  const [tenants, setTenants] = useState<TenantOption[]>(initialTenants)

  // Inline new tenant
  const [showNewTenant, setShowNewTenant] = useState(initialTenants.length === 0)
  const [newTenantName, setNewTenantName] = useState('')
  const [newTenantEmail, setNewTenantEmail] = useState('')
  const [newTenantPhone, setNewTenantPhone] = useState('')
  const [creatingTenant, setCreatingTenant] = useState(false)
  const [tenantError, setTenantError] = useState<string | null>(null)

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [securityDeposit, setSecurityDeposit] = useState('')
  const [paymentDueDay, setPaymentDueDay] = useState('1')
  const [lateFeeAmount, setLateFeeAmount] = useState('')
  const [lateFeeGraceDays, setLateFeeGraceDays] = useState('5')
  const [currency, setCurrency] = useState('USD')
  const [contractNotes, setContractNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleCreateTenant() {
    if (!newTenantName.trim() || !newTenantEmail.trim()) {
      setTenantError('Name and email are required')
      return
    }
    setCreatingTenant(true)
    setTenantError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTenantName, email: newTenantEmail, phone: newTenantPhone || undefined }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setTenantError(json.error ?? 'Failed to create tenant')
        return
      }
      const created = json.data as TenantOption
      setTenants(prev => [...prev, created])
      setTenantId(created.id)
      setShowNewTenant(false)
      setNewTenantName('')
      setNewTenantEmail('')
      setNewTenantPhone('')
    } finally {
      setCreatingTenant(false)
    }
  }

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
          currency,
          contractNotes: contractNotes || undefined,
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

  const inputCls = 'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Unit */}
      <div>
        <label className="block text-sm font-medium mb-1">Unit <span className="text-destructive">*</span></label>
        <select value={unitId} onChange={e => setUnitId(e.target.value)} className={inputCls} required>
          <option value="">Select unit…</option>
          {units.map(u => <option key={u.id} value={u.id}>{u.unitLabel}</option>)}
        </select>
      </div>

      {/* Tenant — dropdown + inline create */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium">Tenant <span className="text-destructive">*</span></label>
          <button
            type="button"
            onClick={() => { setShowNewTenant(v => !v); setTenantError(null) }}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <UserPlus className="h-3.5 w-3.5" />
            {showNewTenant ? 'Use existing' : 'New tenant'}
          </button>
        </div>

        {showNewTenant ? (
          <div className="rounded-md border p-3 space-y-2 bg-muted/20">
            {tenantError && (
              <p className="text-xs text-destructive">{tenantError}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1">Name <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={newTenantName}
                  onChange={e => setNewTenantName(e.target.value)}
                  className={inputCls}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Email <span className="text-destructive">*</span></label>
                <input
                  type="email"
                  value={newTenantEmail}
                  onChange={e => setNewTenantEmail(e.target.value)}
                  className={inputCls}
                  placeholder="jane@example.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Phone</label>
              <input
                type="tel"
                value={newTenantPhone}
                onChange={e => setNewTenantPhone(e.target.value)}
                className={inputCls}
                placeholder="+1 555 000 0000"
              />
            </div>
            <button
              type="button"
              onClick={handleCreateTenant}
              disabled={creatingTenant || !newTenantName.trim() || !newTenantEmail.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {creatingTenant ? 'Creating…' : 'Create & select tenant'}
            </button>
          </div>
        ) : (
          <div className="relative">
            <select
              value={tenantId}
              onChange={e => setTenantId(e.target.value)}
              className={inputCls}
              required
            >
              <option value="">Select tenant…</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
            </select>
            {tenants.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                No tenants yet —{' '}
                <button type="button" onClick={() => setShowNewTenant(true)} className="text-primary hover:underline">
                  create one above
                </button>
              </p>
            )}
          </div>
        )}

        {/* Show selected tenant badge after inline create */}
        {!showNewTenant && tenantId && (
          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
            <ChevronDown className="h-3 w-3" />
            {tenants.find(t => t.id === tenantId)?.name}
          </p>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Start date <span className="text-destructive">*</span></label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">End date <span className="text-destructive">*</span></label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} required />
        </div>
      </div>

      {/* Rent */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Monthly rent <span className="text-destructive">*</span></label>
          <input type="number" value={monthlyRent} onChange={e => setMonthlyRent(e.target.value)} className={inputCls} placeholder="0.00" min="0" step="0.01" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Security deposit</label>
          <input type="number" value={securityDeposit} onChange={e => setSecurityDeposit(e.target.value)} className={inputCls} placeholder="0.00" min="0" step="0.01" />
        </div>
      </div>

      {/* Late fee */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Payment due day</label>
          <input type="number" value={paymentDueDay} onChange={e => setPaymentDueDay(e.target.value)} className={inputCls} min="1" max="28" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Late fee</label>
          <input type="number" value={lateFeeAmount} onChange={e => setLateFeeAmount(e.target.value)} className={inputCls} placeholder="0.00" min="0" step="0.01" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Grace days</label>
          <input type="number" value={lateFeeGraceDays} onChange={e => setLateFeeGraceDays(e.target.value)} className={inputCls} min="0" />
        </div>
      </div>

      {/* Currency */}
      <div>
        <label className="block text-sm font-medium mb-1">Currency</label>
        <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputCls}>
          <option value="USD">USD — US Dollar</option>
          <option value="EUR">EUR — Euro</option>
          <option value="GBP">GBP — British Pound</option>
          <option value="CAD">CAD — Canadian Dollar</option>
          <option value="AUD">AUD — Australian Dollar</option>
          <option value="SGD">SGD — Singapore Dollar</option>
          <option value="AED">AED — UAE Dirham</option>
        </select>
      </div>

      {/* Contract notes */}
      <div>
        <label className="block text-sm font-medium mb-1">Contract notes / additional terms</label>
        <textarea
          value={contractNotes}
          onChange={e => setContractNotes(e.target.value)}
          rows={3}
          className={inputCls + ' resize-none'}
          placeholder="Any special clauses, pet policy, parking terms…"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={onCancel} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {submitting ? 'Creating…' : 'Create lease'}
        </button>
      </div>
    </form>
  )
}
