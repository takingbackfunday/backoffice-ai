export interface MakeRuleSnapType {
  description: string
  payeeId: string | null
  payeeName: string | null
  categoryId: string | null
  categoryName: string | null
}

/**
 * Nullish-aware merge for make-rule snapshots: a later edit that doesn't
 * touch a field (null) must not erase a value captured by an earlier edit,
 * while a later non-null value always wins. `description` is the rule
 * condition seed and always comes from the latest edit.
 */
export function mergeSnap(
  prev: Partial<MakeRuleSnapType> | null | undefined,
  next: Partial<MakeRuleSnapType> & { description: string },
): MakeRuleSnapType {
  return {
    description: next.description,
    payeeId: next.payeeId ?? prev?.payeeId ?? null,
    payeeName: next.payeeName ?? prev?.payeeName ?? null,
    categoryId: next.categoryId ?? prev?.categoryId ?? null,
    categoryName: next.categoryName ?? prev?.categoryName ?? null,
  }
}
