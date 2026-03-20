'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { OnboardingBanner } from '@/components/onboarding/onboarding-banner'

interface Account {
  id: string
  name: string
  type: string
  currency: string
  lastImportAt: Date | null
  institution: { name: string }
}

interface Props {
  accounts: Account[]
  onboarding: boolean
}

export function AccountsClient({ accounts, onboarding }: Props) {
  const router = useRouter()
  const addBtnRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (!onboarding) return
    const btn = addBtnRef.current
    if (!btn) return
    btn.classList.add('ring-2', 'ring-[#534AB7]', 'ring-offset-2', 'animate-pulse')
    const t = setTimeout(() => {
      btn.classList.remove('animate-pulse')
    }, 3000)
    return () => clearTimeout(t)
  }, [onboarding])

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

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Your bank accounts &amp; cards</h2>
        <a
          ref={addBtnRef}
          href={addHref}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all"
          data-testid="add-account-btn"
          aria-label="Add a new account"
        >
          Add account
        </a>
      </div>

      {accounts.length === 0 ? (
        <p className="text-muted-foreground">
          No accounts yet. Add an account to start importing transactions.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="accounts-list">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">{account.name}</p>
                <p className="text-sm text-muted-foreground">
                  {account.institution.name} · {account.type.replace('_', ' ')} · {account.currency}
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {account.lastImportAt
                  ? `Last import: ${new Date(account.lastImportAt).toLocaleDateString()}`
                  : 'Never imported'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
