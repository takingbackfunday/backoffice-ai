'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { BankImportDialog } from './bank-import-dialog'

export function BankImportButton({ label = 'Fetch from bank', initialAccountId, variant = 'default' }: {
  label?: string
  initialAccountId?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link'
}) {
  const [open, setOpen] = useState(false)
  const [hasAccounts, setHasAccounts] = useState<boolean | null>(initialAccountId ? true : null)

  useEffect(() => {
    if (initialAccountId) return
    const controller = new AbortController()
    void fetch('/api/bank-import/accounts', { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json()
        setHasAccounts(response.ok && Array.isArray(json.data) && json.data.length > 0)
      })
      .catch(() => { if (!controller.signal.aborted) setHasAccounts(false) })
    return () => controller.abort()
  }, [initialAccountId])

  if (!hasAccounts) return null
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>{label}</Button>
      <BankImportDialog open={open} onOpenChange={setOpen} initialAccountId={initialAccountId} />
    </>
  )
}
