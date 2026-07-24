'use client'

import type { Payee } from '@/components/rules/rule-types'
import { PayeeCombobox, type PayeeDraftHandle } from '@/components/ui/payee-combobox'

export type { PayeeDraftHandle }

export function PayeeCell({
  value,
  payees,
  onCommit,
  onCancel,
  onNewPayee,
  autoFocus = false,
  unmatchedDraftRef,
}: {
  value: string | null
  payees: Payee[]
  onCommit: (id: string | null, freshPayee?: Payee) => void
  onCancel: () => void
  onNewPayee: (p: Payee) => void
  autoFocus?: boolean
  unmatchedDraftRef?: React.RefObject<PayeeDraftHandle | null>
}) {
  return (
    <PayeeCombobox
      value={value}
      payees={payees}
      onCommit={onCommit}
      onCancel={onCancel}
      onPayeeCreated={onNewPayee}
      autoFocus={autoFocus}
      unmatchedDraftRef={unmatchedDraftRef}
    />
  )
}
