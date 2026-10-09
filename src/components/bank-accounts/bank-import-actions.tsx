'use client'

import { useState } from 'react'
import { BankImportButton } from '@/components/bank-import/bank-import-button'
import { resolveBankKey } from '@/lib/bank-import/banks'
import type { AccountData } from './bank-accounts-client'

export function BankAccountImportActions({ account }: { account: AccountData }) {
  const [notice, setNotice] = useState<string | null>(null)
  const bankKey = resolveBankKey(account.institution.name)
  if (!bankKey) return null
  const supportedBankKey = bankKey

  async function forget(kind: 'profiles' | 'playbooks') {
    const subject = kind === 'profiles' ? 'remembered bank browser' : 'saved export flow'
    if (!window.confirm(`Forget this bank's ${subject}?`)) return
    setNotice(null)
    try {
      const response = await fetch(`/api/bank-import/${kind}?bankKey=${encodeURIComponent(supportedBankKey)}`, { method: 'DELETE' })
      const json = await response.json()
      if (!response.ok || json.error) throw new Error(json.error ?? `Could not forget the ${subject}.`)
      setNotice(kind === 'profiles' ? 'Remembered browser forgotten.' : 'Saved export flow forgotten.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : `Could not forget the ${subject}.`)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      <BankImportButton label="Fetch latest" initialAccountId={account.id} variant="outline" />
      <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => void forget('profiles')}>
        Forget remembered bank browser
      </button>
      <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => void forget('playbooks')}>
        Forget saved export flow
      </button>
      {notice && <span className="w-full text-right text-xs text-muted-foreground" role="status">{notice}</span>}
    </div>
  )
}
