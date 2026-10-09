'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { CsvDropzone } from '@/components/upload/csv-dropzone'
import { ColumnMapper } from '@/components/upload/column-mapper'
import { ActiveSessionBanner } from '@/components/bank-import/active-session-banner'
import { BankImportButton } from '@/components/bank-import/bank-import-button'
import { useUploadStore } from '@/stores/upload-store'
import { resetUploadDropzone } from '@/stores/upload-dropzone-store'
import { OnboardingBanner } from '@/components/onboarding/onboarding-banner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useBankImportHandoff } from '@/components/upload/hooks/use-bank-import-handoff'

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

const NO_JOB_IDS: string[] = []

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

const STEPS = [
  { key: 'upload', label: 'Upload' },
  { key: 'map & import', label: 'Map & import' },
] as const

type DisplayStep = typeof STEPS[number]['key']

function toDisplayStep(step: string): DisplayStep {
  if (step === 'map-columns' || step === 'preview' || step === 'done') return 'map & import'
  return step as DisplayStep
}

export function UploadPageClient({ initialAccounts, onboarding, bankImportId, bankImportEnabled }: {
  initialAccounts?: Account[]
  onboarding?: boolean
  bankImportId?: string
  bankImportEnabled?: boolean
}) {
  const router = useRouter()
  const step = useUploadStore((s) => s.step)
  const lastImport = useUploadStore((s) => s.lastImport)
  const reset = useUploadStore((s) => s.reset)
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts ?? [])
  const [loadingAccounts, setLoadingAccounts] = useState(!initialAccounts)
  const [recentJobs, setRecentJobs] = useState<BackgroundJob[]>([])
  const [jobsLoaded, setJobsLoaded] = useState(false)
  const [tasksTimedOut, setTasksTimedOut] = useState(false)
  const bankImportHandoff = useBankImportHandoff(bankImportEnabled ? bankImportId ?? null : null)
  const jobIds = lastImport?.jobIds ?? NO_JOB_IDS

  useEffect(() => {
    if (initialAccounts) return
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((json) => setAccounts(json.data ?? []))
      .finally(() => setLoadingAccounts(false))
  }, [initialAccounts])

  // Poll only jobs created by this import, and never longer than two minutes.
  useEffect(() => {
    if (step !== 'done' || jobIds.length === 0) {
      setRecentJobs([])
      setJobsLoaded(false)
      setTasksTimedOut(false)
      return
    }
    let cancelled = false
    let polls = 0
    let fetching = false
    let timer: ReturnType<typeof setInterval> | null = null

    const loadJobs = async () => {
      if (fetching) return
      fetching = true
      try {
        const res = await fetch(`/api/jobs/recent?ids=${encodeURIComponent(jobIds.join(','))}`)
        const json = await res.json()
        if (!cancelled) {
          const jobs: BackgroundJob[] = json.data ?? []
          setRecentJobs(jobs)
          setJobsLoaded(true)
          if (jobs.length === jobIds.length && jobs.every((job) => job.status === 'DONE' || job.status === 'FAILED')) {
            if (timer) clearInterval(timer)
            timer = null
          }
        }
      } catch {
        if (!cancelled) setJobsLoaded(true)
      } finally {
        fetching = false
      }
    }

    setRecentJobs([])
    setJobsLoaded(false)
    setTasksTimedOut(false)
    loadJobs()
    timer = setInterval(() => {
      polls++
      if (polls >= 60) {
        if (timer) clearInterval(timer)
        timer = null
        setTasksTimedOut(true)
        return
      }
      loadJobs()
    }, 2000)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [step, jobIds])

  async function handleSkipOnboarding() {
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingStep: 'done' }),
    })
    router.push('/transactions')
  }

  async function finishOnboardingIfNeeded() {
    if (onboarding) {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingStep: 'done' }),
      })
    }
  }

  async function handleImportAnother() {
    await finishOnboardingIfNeeded()
    resetUploadDropzone()
    reset()
    if (onboarding) router.replace('/upload')
  }

  async function handleGoToTransactions() {
    await finishOnboardingIfNeeded()
    resetUploadDropzone()
    reset()
    router.push('/transactions')
  }

  const displayStep = toDisplayStep(step)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Import transactions" />
        <main className="flex-1 p-6 flex flex-col" role="main">

          {onboarding && (
            <OnboardingBanner
              step={3}
              message="Upload a CSV, Excel or PDF statement from your bank to import transactions."
              onSkip={handleSkipOnboarding}
            />
          )}

          {bankImportHandoff.state === 'loading' && (
            <p className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm" role="status">
              Loading your {bankImportHandoff.bankName ?? 'bank'} download…
            </p>
          )}
          {bankImportHandoff.state === 'error' && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm" role="alert">
              <p>{bankImportHandoff.error}</p>
              {bankImportId && bankImportHandoff.unsupported.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {bankImportHandoff.unsupported.map((artifact) => (
                    <li key={artifact.artifactId}>
                      {artifact.reason}{' '}
                      <a className="underline" href={`/api/bank-import/sessions/${encodeURIComponent(bankImportId)}/artifacts/${encodeURIComponent(artifact.artifactId)}`}>
                        Download {artifact.filename}
                      </a>
                      {' '}then use Upload file.
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Progress indicator */}
          <nav aria-label="Upload progress" className="flex gap-6 mb-8 text-sm">
            {STEPS.map((item, i) => (
              <span key={item.key} aria-current={displayStep === item.key ? 'step' : undefined} className={`flex items-center gap-1.5 ${displayStep === item.key ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs ${displayStep === item.key ? 'border-foreground bg-foreground text-background' : ''}`}>
                  {i < STEPS.findIndex((step) => step.key === displayStep) ? '✓' : i + 1}
                </span>
                {item.label}
              </span>
            ))}
          </nav>

          {step === 'upload' && (
            <>
              {bankImportEnabled && <ActiveSessionBanner />}
              {bankImportEnabled && (
                <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
                  <span>Or</span>
                  <BankImportButton label="Fetch from bank" />
                </div>
              )}
              <CsvDropzone />
            </>
          )}

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
            <DialogTitle>{lastImport && lastImport.imported === 0 ? 'Nothing new to import' : 'Import complete!'}</DialogTitle>
            <DialogDescription>
              {lastImport
                ? `Imported ${lastImport.imported} transaction${lastImport.imported === 1 ? '' : 's'}` +
                  (lastImport.skipped > 0 ? ` · ${lastImport.skipped} skipped as duplicates` : '') +
                  (lastImport.unreadable > 0 ? ` · ${lastImport.unreadable} rows couldn't be read` : '') + '.'
                : 'Your transactions have been imported.'}
            </DialogDescription>
          </DialogHeader>

          {jobIds.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Background tasks</p>
              {!jobsLoaded && <p className="text-xs text-muted-foreground">Loading task status…</p>}
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
              {tasksTimedOut && (
                <p className="text-xs text-muted-foreground">Still running in the background — you can close this.</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleImportAnother}>Import another file</Button>
            <Button onClick={handleGoToTransactions}>Go to transactions</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
