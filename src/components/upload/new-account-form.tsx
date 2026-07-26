'use client'

import { useState } from 'react'

export interface Account {
  id: string
  name: string
  currency: string
  institution: { name: string }
}

const ACCOUNT_TYPES = [
  { value: 'CHECKING', label: 'Checking' },
  { value: 'SAVINGS', label: 'Savings' },
  { value: 'CREDIT_CARD', label: 'Credit card' },
  { value: 'BUSINESS_CHECKING', label: 'Business checking' },
  { value: 'TRUST_ACCOUNT', label: 'Trust account' },
] as const

export function NewAccountForm({
  onCreated,
  onCancel,
}: {
  onCreated: (account: Account) => void
  onCancel: () => void
}) {
  const [accountName, setAccountName] = useState('')
  const [bankName, setBankName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [accountType, setAccountType] = useState<typeof ACCOUNT_TYPES[number]['value']>('CHECKING')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!accountName.trim() || !bankName.trim() || currency.length !== 3) return
    setSaving(true)
    setError(null)
    try {
      const instRes = await fetch('/api/institutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: bankName.trim(),
          country: 'US',
          csvMapping: { dateCol: '', amountCol: '', descCol: '', amountSign: 'normal' },
        }),
      })
      const instJson = await instRes.json()
      if (!instRes.ok || instJson.error) {
        setError(instJson.error ?? 'Failed to create institution')
        return
      }

      const accRes = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionSchemaId: instJson.data.id,
          name: accountName.trim(),
          type: accountType,
          currency: currency.toUpperCase(),
        }),
      })
      const accJson = await accRes.json()
      if (!accRes.ok || accJson.error) {
        setError(accJson.error ?? 'Failed to create account')
        return
      }

      onCreated({
        id: accJson.data.id,
        name: accJson.data.name,
        currency: accJson.data.currency,
        institution: { name: bankName.trim() },
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3 mt-2">
      <div>
        <label className="block text-xs font-medium mb-1">
          Account name <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="e.g. HSBC Visa, Revolut GBP, Main Checking"
          className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
          autoFocus
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">A label for your own use — helps tell accounts apart</p>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1">
          Bank / institution <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          placeholder="e.g. HSBC, Chase, Revolut"
          className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium mb-1">
            Currency <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="USD"
            maxLength={3}
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Type</label>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as typeof accountType)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !accountName.trim() || !bankName.trim() || currency.length !== 3}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create account'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export { ACCOUNT_TYPES }
