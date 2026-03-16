'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

const ACCOUNT_TYPES = [
  { value: 'CHECKING', label: 'Checking' },
  { value: 'SAVINGS', label: 'Savings' },
  { value: 'BUSINESS_CHECKING', label: 'Business Checking' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'DEBIT_CARD', label: 'Debit Card' },
  { value: 'TRUST_ACCOUNT', label: 'Trust Account' },
]

const CURRENCIES = ['USD', 'GBP', 'EUR']

interface Institution {
  id: string
  name: string
  country: string
}

export default function NewAccountPage() {
  const router = useRouter()
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [form, setForm] = useState({
    institutionSchemaId: '',
    name: '',
    type: 'CHECKING',
    currency: 'USD',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/institutions')
      .then((r) => r.json())
      .then((json) => setInstitutions(json.data ?? []))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.institutionSchemaId) { setError('Please select a bank.'); return }
    if (!form.name.trim()) { setError('Please enter an account name.'); return }

    setLoading(true)
    setError(null)

    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()

    if (!res.ok || json.error) {
      setError(json.error ?? 'Failed to create account.')
      setLoading(false)
      return
    }

    router.push('/accounts')
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Add Account" />
        <main className="flex-1 p-6" role="main">
          <form
            onSubmit={handleSubmit}
            className="max-w-md space-y-5"
            aria-label="Add a new bank account"
            data-testid="new-account-form"
          >
            <div>
              <label htmlFor="institution" className="block text-sm font-medium mb-1">
                Bank / Institution *
              </label>
              <select
                id="institution"
                value={form.institutionSchemaId}
                onChange={(e) => setForm((f) => ({ ...f, institutionSchemaId: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm"
                data-testid="select-institution"
              >
                <option value="">— select bank —</option>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.country})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="account-name" className="block text-sm font-medium mb-1">
                Account name *
              </label>
              <input
                id="account-name"
                type="text"
                placeholder="e.g. Chase Business Checking"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm"
                data-testid="input-account-name"
              />
            </div>

            <div>
              <label htmlFor="account-type" className="block text-sm font-medium mb-1">
                Account type *
              </label>
              <select
                id="account-type"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm"
                data-testid="select-account-type"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="currency" className="block text-sm font-medium mb-1">
                Currency *
              </label>
              <select
                id="currency"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm"
                data-testid="select-currency"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-sm text-red-600" role="alert" data-testid="form-error">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                data-testid="submit-account-btn"
              >
                {loading ? 'Saving…' : 'Add account'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/accounts')}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}
