'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { CsvDropzone } from '@/components/upload/csv-dropzone'
import { ColumnMapper } from '@/components/upload/column-mapper'
import { useUploadStore } from '@/stores/upload-store'

interface Account {
  id: string
  name: string
  currency: string
  institution: { name: string }
}

const STEPS = ['select-account', 'upload', 'map & import', 'done'] as const

type DisplayStep = typeof STEPS[number]

function toDisplayStep(step: string): DisplayStep {
  if (step === 'map-columns' || step === 'preview') return 'map & import'
  return step as DisplayStep
}

export default function UploadPage() {
  const { step, setAccountId, accountId } = useUploadStore()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)

  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((json) => setAccounts(json.data ?? []))
      .finally(() => setLoadingAccounts(false))
  }, [])

  const displayStep = toDisplayStep(step)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Import Transactions" />
        <main className="flex-1 p-6 flex flex-col" role="main">

          {/* Progress indicator */}
          <nav aria-label="Upload progress" className="flex gap-6 mb-8 text-sm">
            {STEPS.map((s, i) => (
              <span key={s} className={`flex items-center gap-1.5 ${displayStep === s ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs ${displayStep === s ? 'border-foreground bg-foreground text-background' : ''}`}>
                  {i + 1}
                </span>
                {s}
              </span>
            ))}
          </nav>

          {/* Step 1: Select account */}
          {step === 'select-account' && (
            <div className="max-w-md space-y-4">
              <p className="text-sm text-muted-foreground">Choose which account this CSV belongs to.</p>
              {loadingAccounts ? (
                <p className="text-sm text-muted-foreground">Loading accounts…</p>
              ) : accounts.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">You have no accounts yet.</p>
                  <a
                    href="/accounts/new"
                    className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    Add an account first →
                  </a>
                </div>
              ) : (
                <ul className="space-y-2" data-testid="account-picker">
                  {accounts.map((account) => (
                    <li key={account.id}>
                      <button
                        onClick={() => setAccountId(account.id)}
                        className={`w-full text-left rounded-lg border p-4 hover:border-foreground transition-colors ${accountId === account.id ? 'border-foreground' : ''}`}
                        data-testid={`pick-account-${account.id}`}
                        aria-label={`Select ${account.name}`}
                      >
                        <p className="font-medium">{account.name}</p>
                        <p className="text-sm text-muted-foreground">{account.institution.name} · {account.currency}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Step 2: Upload CSV */}
          {step === 'upload' && <CsvDropzone />}

          {/* Step 3: Map columns + live preview + import */}
          {(step === 'map-columns' || step === 'preview') && <ColumnMapper />}

          {/* Done */}
          {step === 'done' && (
            <div className="text-center py-12">
              <h2 className="text-2xl font-semibold text-green-600 mb-2">Import complete!</h2>
              <p className="text-muted-foreground mb-4">Your transactions have been imported successfully.</p>
              <a href="/transactions" className="underline text-primary">View transactions →</a>
            </div>
          )}

        </main>
      </div>
    </div>
  )
}
