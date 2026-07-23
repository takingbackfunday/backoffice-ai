'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { CsvDropzone } from '@/components/upload/csv-dropzone'
import { ColumnMapper } from '@/components/upload/column-mapper'
import { useUploadStore } from '@/stores/upload-store'
import { OnboardingBanner } from '@/components/onboarding/onboarding-banner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface BackgroundJob {
  id: string
  type: string
  status: string
  attempts: number
  lastError: string | null
  createdAt: string
  completedAt: string | null
}

const JOB_TYPE_LABELS: Record<string, string> = {
  'invoice-matching': 'Invoice matching',
  'receipt-matching': 'Receipt matching',
  'rules-agent': 'Categorization',
}

function formatJobStatus(job: BackgroundJob): string {
  if (job.status === 'DONE') return 'Complete'
  if (job.status === 'FAILED') return 'Failed'
  if (job.status === 'RUNNING') return 'Running...'
  return 'Queued'
}

interface Account {
  id: string
  name: string
  currency: string
  institution: { name: string }
}

const STEPS = ['upload', 'map & import'] as const

type DisplayStep = typeof STEPS[number]

function toDisplayStep(step: string): DisplayStep {
  if (step === 'map-columns' || step === 'preview') return 'map & import'
  return step as DisplayStep
}

export function UploadPageClient({ initialAccounts, onboarding }: { initialAccounts?: Account[]; onboarding?: boolean }) {
  const router = useRouter()
  const { step, reset } = useUploadStore()
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts ?? [])
  const [loadingAccounts, setLoadingAccounts] = useState(!initialAccounts)
  const [recentJobs, setRecentJobs] = useState<BackgroundJob[]>([])
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (initialAccounts) return
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((json) => setAccounts(json.data ?? []))
      .finally(() => setLoadingAccounts(false))
  }, [initialAccounts])

  // Fetch jobs when import completes and poll until all are done
  useEffect(() => {
    if (step !== 'done') return

    let cancelled = false

    const loadJobs = async () => {
      try {
        const res = await fetch('/api/jobs/recent?limit=5')
        const json = await res.json()
        if (!cancelled) setRecentJobs(json.data ?? [])
      } catch {
        // Silently ignore — job status is non-critical
      }
    }

    loadJobs()

    // Poll every 2s until all jobs are terminal (DONE or FAILED)
    pollRef.current = setInterval(() => {
      loadJobs()
    }, 2000)

    return () => {
      cancelled = true
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [step])

  // Stop polling when all jobs are terminal
  useEffect(() => {
    if (step !== 'done') return
    const allTerminal = recentJobs.length > 0 && recentJobs.every(j => j.status === 'DONE' || j.status === 'FAILED')
    if (allTerminal && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [recentJobs, step])

  async function handleSkipOnboarding() {
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingStep: 'done' }),
    })
    router.push('/transactions')
  }

  async function handleImportDone() {
    if (onboarding) {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingStep: 'done' }),
      })
    }
    reset()
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
              message="Upload a CSV or PDF statement from your bank to import transactions."
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

        </main>
      </div>

      <Dialog open={step === 'done'}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import complete!</DialogTitle>
            <DialogDescription>Your transactions have been imported successfully.</DialogDescription>
          </DialogHeader>

          {/* Background job status */}
          {recentJobs.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Background tasks</p>
              {recentJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between text-sm">
                  <span>{JOB_TYPE_LABELS[job.type] ?? job.type}</span>
                  <span className={`text-xs ${
                    job.status === 'DONE' ? 'text-green-600' :
                    job.status === 'FAILED' ? 'text-red-600' :
                    'text-muted-foreground'
                  }`}>
                    {formatJobStatus(job)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {recentJobs.length === 0 && (
            <div className="mt-4 text-xs text-muted-foreground">Loading task status...</div>
          )}

          <DialogFooter>
            <Button onClick={handleImportDone}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
