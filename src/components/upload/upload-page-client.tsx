'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { CsvDropzone } from '@/components/upload/csv-dropzone'
import { ColumnMapper } from '@/components/upload/column-mapper'
import { useUploadStore } from '@/stores/upload-store'
import { OnboardingBanner } from '@/components/onboarding/onboarding-banner'

interface Account {
  id: string
  name: string
  currency: string
  institution: { name: string }
}

const STEPS = ['upload', 'map & import', 'done'] as const

type DisplayStep = typeof STEPS[number]

function toDisplayStep(step: string): DisplayStep {
  if (step === 'map-columns' || step === 'preview') return 'map & import'
  return step as DisplayStep
}

export function UploadPageClient({ initialAccounts, onboarding }: { initialAccounts?: Account[]; onboarding?: boolean }) {
  const router = useRouter()
  const { step } = useUploadStore()
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts ?? [])
  const [loadingAccounts, setLoadingAccounts] = useState(!initialAccounts)

  useEffect(() => {
    if (initialAccounts) return
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((json) => setAccounts(json.data ?? []))
      .finally(() => setLoadingAccounts(false))
  }, [initialAccounts])

  useEffect(() => {
    if (!onboarding || step !== 'done') return
    fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingStep: 'done' }),
    }).then(() => router.push('/transactions'))
  }, [onboarding, step, router])

  async function handleSkipOnboarding() {
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingStep: 'done' }),
    })
    router.push('/transactions')
  }

  const displayStep = toDisplayStep(step)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Import Transactions" />
        <main className="flex-1 p-6 flex flex-col" role="main">

          {onboarding && (
            <OnboardingBanner
              step={3}
              message="Upload a CSV from your bank to import transactions."
              onSkip={handleSkipOnboarding}
            />
          )}

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

          {/* Step 1: Upload CSV */}
          {step === 'upload' && <CsvDropzone />}

          {/* Step 2: Select account + Map columns + live preview + import */}
          {(step === 'map-columns' || step === 'preview') && (
            <ColumnMapper
              accounts={accounts}
              loadingAccounts={loadingAccounts}
              onAccountCreated={(a) => setAccounts((prev) => [...prev, a])}
            />
          )}

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
