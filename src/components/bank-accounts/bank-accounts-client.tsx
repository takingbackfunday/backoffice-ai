'use client'

import { useRouter } from 'next/navigation'
import { OnboardingBanner } from '@/components/onboarding/onboarding-banner'
import { BankAccountImportActions } from './bank-import-actions'

export interface AccountData {
  id: string
  name: string
  type: string
  currency: string
  lastImportAt: string | null
  createdAt: string
  institution: { name: string }
}

interface Props {
  accounts: AccountData[]
  onboarding: boolean
  bankImportEnabled: boolean
}

// ── Accounts tab ─────────────────────────────────────────────────────────────

function AccountsTab({ accounts, onboarding, bankImportEnabled }: { accounts: AccountData[]; onboarding: boolean; bankImportEnabled: boolean }) {
  const router = useRouter()

  async function handleSkip() {
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingStep: 'done' }),
    })
    router.push('/transactions')
  }

  const addHref = onboarding ? '/accounts/new?onboarding=1' : '/accounts/new'

  return (
    <>
      {onboarding && (
        <OnboardingBanner
          step={2}
          message="Add your first bank account or credit card to start importing transactions."
          onSkip={handleSkip}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Accounts are used to group transactions. Each account belongs to an institution.
        </p>
        <a
          href={addHref}
          className="shrink-0 rounded-md bg-[#3C3489] px-4 py-1.5 text-sm font-medium text-[#EEEDFE] hover:bg-[#2d2770] transition-colors"
          data-testid="add-account-btn"
        >
          + Add account
        </a>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
          No accounts yet. Add one to start importing transactions.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="accounts-list">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 rounded-lg border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.institution.name} · {a.type.replace(/_/g, ' ')} · {a.currency}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <span className="text-xs text-muted-foreground">
                  {a.lastImportAt
                    ? `Last import: ${new Date(a.lastImportAt).toLocaleDateString()}`
                    : 'Never imported'}
                </span>
                {bankImportEnabled && <BankAccountImportActions account={a} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function BankAccountsClient({ accounts, onboarding, bankImportEnabled }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bank Accounts &amp; Cards</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage accounts and fetch supported bank transactions.</p>
      </div>
      <AccountsTab accounts={accounts} onboarding={onboarding} bankImportEnabled={bankImportEnabled} />
    </div>
  )
}
