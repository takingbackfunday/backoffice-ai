'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export interface BankImportAccount {
  id: string
  name: string
  type: string
  currency: string
  institutionName: string
  bankKey: 'chase' | 'n26' | 'fakebank'
  bankName: string
  askAccountHint: boolean
  bankAccountHint: string | null
  lastTxnDate: string | null
}

export function AccountStep({ initialAccountId, onContinue }: {
  initialAccountId?: string
  onContinue: (account: BankImportAccount, accountHint?: string) => void
}) {
  const [accounts, setAccounts] = useState<BankImportAccount[]>([])
  const [selectedId, setSelectedId] = useState(initialAccountId ?? '')
  const [accountHint, setAccountHint] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/bank-import/accounts', { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json()
        if (!response.ok || json.error) throw new Error(json.error ?? 'Could not load bank accounts.')
        const data = (json.data ?? []) as BankImportAccount[]
        setAccounts(data)
        const initial = data.find((account) => account.id === initialAccountId) ?? data[0]
        if (initial) {
          setSelectedId(initial.id)
          setAccountHint(initial.bankAccountHint ?? '')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load bank accounts.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [initialAccountId])

  const selected = accounts.find((account) => account.id === selectedId)
  const hintEnabled = selected?.askAccountHint ?? false

  function selectAccount(id: string) {
    const account = accounts.find((item) => item.id === id)
    setSelectedId(id)
    setAccountHint(account?.bankAccountHint ?? '')
  }

  return (
    <section className="space-y-4" aria-label="Choose a bank account">
      <div>
        <h3 className="text-sm font-semibold">Choose an account</h3>
        <p className="mt-1 text-sm text-muted-foreground">One account is fetched per session.</p>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Loading supported accounts…</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {!loading && !error && accounts.length === 0 && (
        <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">Fetch from bank currently supports Chase and N26 accounts.</p>
      )}
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {accounts.map((account) => (
          <label key={account.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${selectedId === account.id ? 'border-foreground bg-muted/50' : 'border-border'}`}>
            <input type="radio" name="bank-import-account" value={account.id} checked={selectedId === account.id} onChange={() => selectAccount(account.id)} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{account.bankName} · {account.name}</span>
              <span className="block text-xs text-muted-foreground">
                Last transaction: {account.lastTxnDate ? new Date(`${account.lastTxnDate}T00:00:00`).toLocaleDateString() : 'No transactions yet'}
              </span>
            </span>
          </label>
        ))}
      </div>
      {hintEnabled && (
        <label className="block space-y-1 text-sm">
          <span>Last 4 digits as shown on Chase (optional)</span>
          <input className="w-full rounded-md border border-border bg-background px-3 py-2" maxLength={40} value={accountHint} onChange={(event) => setAccountHint(event.target.value)} />
        </label>
      )}
      <div className="flex justify-end">
        <Button disabled={!selected || loading} onClick={() => selected && onContinue(selected, accountHint.trim() || undefined)}>Continue</Button>
      </div>
    </section>
  )
}
