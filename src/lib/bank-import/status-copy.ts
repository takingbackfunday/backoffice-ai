import type { BankImportStatusValue } from './status'

export interface StatusCopyInput {
  status: BankImportStatusValue
  needsUserReason: string | null
  bankName: string
  queuedForMs: number
  errorMessage: string | null
}

export function statusCopy(input: StatusCopyInput): {
  title: string
  body: string
  tone: 'info' | 'action' | 'success' | 'error'
} {
  const { status, needsUserReason, bankName, queuedForMs, errorMessage } = input
  if (status === 'QUEUED') {
    if (queuedForMs < 30_000) return { title: 'Waking up the import service…', body: 'The first run can take up to 30 seconds.', tone: 'info' }
    if (queuedForMs <= 90_000) return { title: 'Still starting…', body: 'Hang tight, this is taking longer than usual.', tone: 'info' }
    return { title: "The import service didn't start", body: 'Please try again in a minute.', tone: 'error' }
  }
  if (status === 'STARTING') return { title: 'Starting a secure browser…', body: '', tone: 'info' }
  if (status === 'AWAITING_LOGIN' && needsUserReason === 'mfa') {
    return {
      title: "Confirm it's you",
      body: `Approve the sign-in in your ${bankName} app, or enter the code ${bankName} sent you in the window below.`,
      tone: 'action',
    }
  }
  if (status === 'AWAITING_LOGIN') {
    return { title: `Sign in to ${bankName}`, body: 'Use the window below. We never see or store your password.', tone: 'action' }
  }
  if (status === 'NAVIGATING') {
    return { title: 'Finding your transactions…', body: "You can watch, or leave this open. We'll let you know if we need you.", tone: 'info' }
  }
  if (status === 'NEEDS_USER' && needsUserReason === 'mfa') {
    return { title: `${bankName} wants to confirm it's you`, body: 'Complete the check in the window below.', tone: 'action' }
  }
  if (status === 'NEEDS_USER' && needsUserReason === 'takeover') {
    return { title: "You're in control", body: 'Download the CSV yourself. We\'ll pick it up automatically.', tone: 'action' }
  }
  if (status === 'NEEDS_USER') {
    return { title: 'The assistant needs a hand', body: 'Please download the CSV yourself in the window below. We\'ll pick it up automatically.', tone: 'action' }
  }
  if (status === 'CAPTURED') return { title: 'Got it', body: 'Opening the review screen…', tone: 'success' }
  if (status === 'COMPLETE') return { title: 'Imported', body: '', tone: 'success' }
  if (status === 'FAILED') return { title: 'Something went wrong', body: errorMessage ?? 'Please try again.', tone: 'error' }
  if (status === 'EXPIRED') return { title: 'This session timed out', body: 'Nothing was imported. You can start again.', tone: 'error' }
  return { title: 'Cancelled', body: 'Nothing was imported.', tone: 'info' }
}
