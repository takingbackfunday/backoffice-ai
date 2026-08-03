/**
 * Pure, testable guard for confirming navigation when there are unsaved changes.
 * Returns `true` when navigation should proceed, `false` to cancel.
 *
 * `confirmFn` is injected for testability (e.g. `window.confirm.bind(window)` in the browser).
 */
export const UNSAVED_INVOICE_MESSAGE =
  'You have unsaved changes on this invoice. Leave anyway and discard them?'

export function confirmLeaveWithChanges(
  dirty: boolean,
  confirmFn: (msg: string) => boolean
): boolean {
  if (!dirty) return true
  return confirmFn(UNSAVED_INVOICE_MESSAGE)
}
