'use client'

import type { CategoryGroup } from '@/components/rules/rule-types'
import { CategoryCombobox, type CategorySuggestion } from '@/components/ui/category-combobox'

export type { CategorySuggestion }

export function CategoryCell({
  value,
  groups,
  description,
  payeeName,
  amount,
  onCommit,
  onCancel,
  autoFocus = false,
}: {
  value: string | null
  groups: CategoryGroup[]
  description: string
  payeeName: string | null
  amount: number
  onCommit: (id: string | null) => void
  onCancel: () => void
  autoFocus?: boolean
}) {
  return (
    <CategoryCombobox
      value={value}
      groups={groups}
      context={{ description, payeeName, amount }}
      onCommit={onCommit}
      onCancel={onCancel}
      autoFocus={autoFocus}
    />
  )
}
