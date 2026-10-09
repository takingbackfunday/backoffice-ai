'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { addDays } from '@/lib/bank-import/date-range'
import { localToday } from '@/lib/bank-import/local-date'
import { useDefaultRange } from './hooks/use-default-range'
import type { BankImportAccount } from './account-step'

type Preset = 'since_last' | 'last_30' | 'last_90' | 'custom'

export function RangeStep({ account, accountHint, onBack, onStart, starting, error }: {
  account: BankImportAccount
  accountHint?: string
  onBack: () => void
  onStart: (range: { dateFrom: string; dateTo: string; rememberBrowser: boolean }) => void
  starting: boolean
  error: string | null
}) {
  const { data, loading, error: rangeError } = useDefaultRange(account.id)
  const [selection, setSelection] = useState<{ accountId: string; preset: Preset; dateFrom: string; dateTo: string } | null>(null)
  const [rememberBrowser, setRememberBrowser] = useState(true)
  const currentSelection = selection?.accountId === account.id ? selection : null
  const preset = currentSelection?.preset ?? 'since_last'
  const dateFrom = currentSelection?.dateFrom ?? data?.from ?? ''
  const dateTo = currentSelection?.dateTo ?? data?.to ?? ''

  function choosePreset(next: Preset) {
    const today = localToday()
    const from = next === 'since_last' ? data?.from ?? dateFrom
      : next === 'last_30' ? addDays(today, -29)
      : next === 'last_90' ? addDays(today, -89)
      : dateFrom
    setSelection({ accountId: account.id, preset: next, dateFrom: from, dateTo: today })
  }

  const valid = dateFrom.length > 0 && dateTo.length > 0 && dateFrom <= dateTo
  const explanation = data?.lastTxnDate
    ? `Your last transaction is ${data.lastTxnDate}. We'll fetch ${dateFrom || data.from} → ${dateTo}. The 3-day overlap catches late-posting items; duplicates are skipped automatically.`
    : 'No transaction history found. The default range is the last 90 days.'

  return (
    <section className="space-y-4" aria-label="Choose a date range">
      <div>
        <h3 className="text-sm font-semibold">Date range · {account.bankName}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{loading ? 'Calculating the suggested range…' : explanation}</p>
        {accountHint && <p className="mt-1 text-xs text-muted-foreground">Account hint saved for this account.</p>}
      </div>
      {rangeError && <p className="text-sm text-destructive" role="alert">{rangeError}</p>}
      <div className="flex flex-wrap gap-2" aria-label="Date range presets">
        {([
          ['since_last', 'Since last import'], ['last_30', 'Last 30 days'], ['last_90', 'Last 90 days'], ['custom', 'Custom'],
        ] as [Preset, string][]).map(([value, label]) => (
          <Button key={value} type="button" size="sm" variant={preset === value ? 'default' : 'outline'} onClick={() => choosePreset(value)}>{label}</Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm"><span>From</span><input type="date" className="w-full rounded-md border border-border bg-background px-2 py-2" value={dateFrom} onChange={(event) => setSelection({ accountId: account.id, preset: 'custom', dateFrom: event.target.value, dateTo })} /></label>
        <label className="space-y-1 text-sm"><span>To</span><input type="date" className="w-full rounded-md border border-border bg-background px-2 py-2" value={dateTo} max={data?.to} onChange={(event) => setSelection({ accountId: account.id, preset: 'custom', dateFrom, dateTo: event.target.value })} /></label>
      </div>
      <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
        <input type="checkbox" checked={rememberBrowser} onChange={(event) => setRememberBrowser(event.target.checked)} />
        <span><span className="block font-medium">Remember this browser for faster sign-in</span><span className="mt-1 block text-xs text-muted-foreground">Keeps the bank&apos;s trusted-device cookie in our secure cloud browser so you&apos;re asked for codes less often. Your password is never stored. The export route is learned separately after a successful fetch.</span></span>
      </label>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button disabled={!valid || loading || starting} onClick={() => onStart({ dateFrom, dateTo, rememberBrowser })}>{starting ? 'Starting…' : 'Start'}</Button>
      </div>
    </section>
  )
}
