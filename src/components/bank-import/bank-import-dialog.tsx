'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { localToday } from '@/lib/bank-import/local-date'
import { AccountStep, type BankImportAccount } from './account-step'
import { RangeStep } from './range-step'
import { SessionStep } from './session-step'

type Step = 'account' | 'range' | 'session'

export function BankImportDialog({ open, onOpenChange, initialAccountId, resumeSessionId }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialAccountId?: string
  resumeSessionId?: string
}) {
  const [step, setStep] = useState<Step>('account')
  const [account, setAccount] = useState<BankImportAccount | null>(null)
  const [accountHint, setAccountHint] = useState<string | undefined>()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStartError(null)
    if (resumeSessionId) {
      setSessionId(resumeSessionId)
      setStep('session')
      return
    }
    setSessionId(null)
    setAccount(null)
    setAccountHint(undefined)
    setStep('account')
  }, [open, resumeSessionId])

  async function start(range: { dateFrom: string; dateTo: string; rememberBrowser: boolean }) {
    if (!account || starting) return
    setStarting(true)
    setStartError(null)
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
    try {
      const response = await fetch('/api/bank-import/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          today: localToday(),
          rememberBrowser: range.rememberBrowser,
          accountHint,
        }),
      })
      const json = await response.json()
      if (response.status === 409 && json.data?.id) {
        setSessionId(json.data.id)
        setStep('session')
        return
      }
      if (!response.ok || json.error) throw new Error(json.error ?? 'Could not start the bank import.')
      setSessionId(json.data.id)
      setStep('session')
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : 'Could not start the bank import.')
    } finally {
      setStarting(false)
    }
  }

  function retry() {
    setSessionId(null)
    setStartError(null)
    setStep('range')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={step === 'session' ? 'max-w-5xl' : 'max-w-xl'}>
        <DialogHeader>
          <DialogTitle>Fetch from bank</DialogTitle>
          <DialogDescription>
            {step === 'account' ? 'Choose the account to update.' : step === 'range' ? 'Confirm the transactions and dates to fetch.' : 'Sign in at your bank, then let the assistant find the CSV export.'}
          </DialogDescription>
        </DialogHeader>
        {step === 'account' && (
          <AccountStep
            initialAccountId={initialAccountId}
            onContinue={(selected, hint) => { setAccount(selected); setAccountHint(hint); setStep('range') }}
          />
        )}
        {step === 'range' && account && (
          <RangeStep account={account} accountHint={accountHint} onBack={() => setStep('account')} onStart={start} starting={starting} error={startError} />
        )}
        {step === 'session' && sessionId && (
          <SessionStep id={sessionId} onClose={() => onOpenChange(false)} onRetry={retry} />
        )}
      </DialogContent>
    </Dialog>
  )
}
