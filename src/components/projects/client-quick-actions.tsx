'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Briefcase, FileText, FileCheck, Receipt, Clock, Plus, X, Loader2 } from 'lucide-react'
import { JobSelect } from './job-select'

interface Job { id: string; name: string }

interface Props {
  projectId: string
  projectSlug: string
  jobs: Job[]
  defaultRate: number | null
  currency: string
}

const emptyTimeForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  hours: '',
  minutes: '',
  description: '',
  billable: true,
  rate: '',
  jobId: '',
})

export function ClientQuickActions({ projectId, projectSlug, jobs, defaultRate, currency }: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<'job' | 'time' | null>(null)

  // New job state
  const [jobName, setJobName] = useState('')
  const [savingJob, setSavingJob] = useState(false)
  const [jobError, setJobError] = useState<string | null>(null)

  // Log time state
  const [timeForm, setTimeForm] = useState(emptyTimeForm)
  const [savingTime, setSavingTime] = useState(false)
  const [timeError, setTimeError] = useState<string | null>(null)

  function close() {
    setModal(null)
    setJobName(''); setJobError(null)
    setTimeForm(emptyTimeForm()); setTimeError(null)
  }

  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault()
    if (!jobName.trim()) return
    setSavingJob(true); setJobError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: jobName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setJobError(json.error ?? 'Failed to create job'); return }
      close()
      router.refresh()
    } finally {
      setSavingJob(false)
    }
  }

  async function handleLogTime(e: React.FormEvent) {
    e.preventDefault()
    const totalMins = (parseInt(timeForm.hours || '0') * 60) + parseInt(timeForm.minutes || '0')
    if (!timeForm.description.trim()) { setTimeError('Description is required'); return }
    if (totalMins < 1) { setTimeError('Enter at least 1 minute'); return }
    setSavingTime(true); setTimeError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: timeForm.date,
          minutes: totalMins,
          description: timeForm.description.trim(),
          billable: timeForm.billable,
          rate: timeForm.rate ? parseFloat(timeForm.rate) : null,
          jobId: timeForm.jobId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setTimeError(json.error ?? 'Failed to save'); return }
      close()
      router.refresh()
    } finally {
      setSavingTime(false)
    }
  }

  const base = `/projects/${projectSlug}`
  const btnLink = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors'
  const btnAction = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors cursor-pointer'
  const field = 'w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30'

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button onClick={() => setModal('job')} className={btnAction}>
          <Briefcase className="w-3 h-3" /> New job
        </button>
        <Link href={`${base}/estimates/new`} className={btnLink}>
          <FileText className="w-3 h-3" /> New estimate
        </Link>
        <Link href={`${base}/quotes/new`} className={btnLink}>
          <FileCheck className="w-3 h-3" /> New quote
        </Link>
        <Link href={`${base}/invoices/new`} className={btnLink}>
          <Receipt className="w-3 h-3" /> New invoice
        </Link>
        <button onClick={() => setModal('time')} className={btnAction}>
          <Clock className="w-3 h-3" /> Log time
        </button>
      </div>

      {/* New job modal */}
      {modal === 'job' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
          <div className="w-full max-w-sm rounded-xl bg-background border shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">New job</h2>
              <button onClick={close} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleCreateJob} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Job name <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  required
                  value={jobName}
                  onChange={e => setJobName(e.target.value)}
                  placeholder="Brand redesign, Q2 retainer…"
                  autoFocus
                  className={field}
                />
              </div>
              {jobError && <p className="text-xs text-destructive">{jobError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={close} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={savingJob || !jobName.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {savingJob ? 'Creating…' : 'Create job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log time modal */}
      {modal === 'time' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
          <div className="w-full max-w-md rounded-xl bg-background border shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Log time</h2>
              <button onClick={close} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleLogTime} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Date</label>
                  <input type="date" value={timeForm.date} onChange={e => setTimeForm(f => ({ ...f, date: e.target.value }))} required className={field} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Duration</label>
                  <div className="flex items-center gap-1">
                    <input type="number" value={timeForm.hours} onChange={e => setTimeForm(f => ({ ...f, hours: e.target.value }))} placeholder="0" min="0" className="w-full rounded-md border px-2 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <span className="text-muted-foreground text-xs shrink-0">h</span>
                    <input type="number" value={timeForm.minutes} onChange={e => setTimeForm(f => ({ ...f, minutes: e.target.value }))} placeholder="0" min="0" max="59" className="w-full rounded-md border px-2 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <span className="text-muted-foreground text-xs shrink-0">m</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Description <span className="text-destructive">*</span></label>
                <input type="text" required value={timeForm.description} onChange={e => setTimeForm(f => ({ ...f, description: e.target.value }))} placeholder="What did you work on?" autoFocus className={field} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-medium mb-1">Job <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <JobSelect
                      value={timeForm.jobId}
                      onChange={jobId => setTimeForm(f => ({ ...f, jobId }))}
                      jobs={jobs}
                      projectId={projectId}
                    />
                  </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Rate override <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <input type="number" value={timeForm.rate} onChange={e => setTimeForm(f => ({ ...f, rate: e.target.value }))} placeholder={defaultRate ? `${defaultRate} (default)` : 'per hr'} min="0" step="0.01" className={field} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={timeForm.billable} onChange={e => setTimeForm(f => ({ ...f, billable: e.target.checked }))} className="rounded" />
                Billable
              </label>
              {timeError && <p className="text-xs text-destructive">{timeError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={close} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={savingTime} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {savingTime ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
