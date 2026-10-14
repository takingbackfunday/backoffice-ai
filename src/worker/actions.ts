import type { Page } from 'playwright-core'
import { formatBankDate, inferBankDateFormat, isIsoDate, parseBankDate } from '@/lib/bank-import/date-range'
import { isElementDenied } from '@/lib/bank-import/guardrails'
import type { BankConfig } from '@/lib/bank-import/banks'
import type { AgentAction } from './navigator'
import type { PageSnapshot } from './page-elements'

export interface ActionResult {
  ok: boolean
  message: string
  blocked?: boolean
  expectDownload?: boolean
  verifiedValue?: string
  errorCode?: string
}

export async function executeAction(args: {
  page: Page
  snap: PageSnapshot
  action: AgentAction
  bank: BankConfig
  from: string
  to: string
}): Promise<ActionResult> {
  const { page, snap, action, bank, from, to } = args
  if (action.action === 'need_user') return { ok: false, message: 'The assistant needs your help.' }
  if (action.action === 'scroll') {
    try {
      await page.mouse.wheel(0, 600)
      await page.waitForTimeout(600)
      return { ok: true, message: 'Scrolled the page.' }
    } catch { return { ok: false, message: 'Could not scroll the page.', errorCode: 'navigation_stuck' } }
  }
  if (action.action === 'wait') {
    await page.waitForTimeout(2500)
    return { ok: true, message: 'Waited for the page.' }
  }

  const element = snap.elements.find((candidate) => candidate.id === action.elementId)
  if (!element) return { ok: false, message: 'The page changed before the action could run.', errorCode: 'element_missing' }
  const denial = isElementDenied(element, 'navigate')
  if (denial.denied) return { ok: false, blocked: true, message: 'A restricted bank action was blocked.', errorCode: 'guardrail_violation' }
  const locator = snap.locate(element.id)
  if (!locator) return { ok: false, message: 'The page changed before the action could run.', errorCode: 'locator_missing' }
  if (element.disabled) return { ok: false, message: 'That bank control is disabled.', errorCode: 'bank_action_failed' }

  try {
    if (action.dateField && action.action !== 'fill_date') {
      if (/download|export|herunterladen|exportieren/i.test(`${element.text} ${element.ariaLabel ?? ''}`)) {
        return { ok: false, message: 'An export control is not a calendar selection.', errorCode: 'not_date_field' }
      }
      const iso = action.dateField === 'from' ? from : to
      if (!isIsoDate(iso)) return { ok: false, message: 'The requested date is invalid.', errorCode: 'date_not_accepted' }
      const input = action.dateInputId === undefined ? undefined : snap.elements.find(candidate => candidate.id === action.dateInputId)
      // Capture the input locator before clicking: calendar controls can disappear and IDs are refreshed each turn.
      const inputLocator = input && snap.locate(input.id)
      if (action.dateInputId !== undefined) {
        if (action.action !== 'click' || action.dateInputId === element.id || !input || input.tag !== 'input' || !['date', 'text'].includes(input.type ?? '') || !inputLocator || input.value === undefined) {
          return { ok: false, message: 'The selected calendar date cannot be verified.', errorCode: 'not_date_field' }
        }
        const label = `${input.text} ${input.ariaLabel ?? ''} ${input.placeholder ?? ''}`.toLowerCase()
        if (action.dateField === 'from' && /\b(to|through|end|until|bis)\b/.test(label) ||
          action.dateField === 'to' && /\b(from|start|since|von)\b/.test(label)) {
          return { ok: false, message: 'The selected calendar belongs to the other date field.', errorCode: 'date_field_mismatch' }
        }
      }
      if (action.action === 'select_option') {
        if (element.tag !== 'select' || !action.option) return { ok: false, message: 'That calendar option is no longer available.', errorCode: 'option_mismatch' }
        await locator.selectOption({ label: action.option }, { timeout: 10_000 })
      } else if (action.action === 'click') {
        await locator.click({ timeout: 10_000 })
      } else {
        return { ok: false, message: 'That calendar action is not supported.', errorCode: 'not_date_field' }
      }
      await page.waitForTimeout(500)
      if (!input || !inputLocator) return { ok: true, message: 'Opened or navigated the date picker; date selection is not yet verified.' }
      const format = input.type === 'date' ? 'ISO' as const : inferBankDateFormat(`${input.placeholder ?? ''} ${input.text} ${input.ariaLabel ?? ''}`) ?? bank.dateFormat
      const readback = await inputLocator.inputValue({ timeout: 3000 }).catch(() => '')
      if (parseBankDate(readback, format) !== iso) {
        return { ok: false, message: 'The calendar did not select the requested date.', errorCode: 'date_not_accepted' }
      }
      return { ok: true, message: `Selected the ${action.dateField} date using the calendar.`, verifiedValue: readback }
    }
    if (action.action === 'click' && element.tag === 'input' && element.type === 'radio') {
      if (!await locator.isChecked()) {
        // Styled radios often intercept clicks on the input; use its native associated label.
        const handle = await locator.evaluateHandle((input) => (input as HTMLInputElement).labels?.[0] ?? null)
        try {
          const label = handle.asElement()
          if (label && await label.isVisible()) {
            const labelText = await label.innerText()
            if (isElementDenied({ text: labelText, ariaLabel: await label.getAttribute('aria-label') ?? undefined }, 'navigate').denied) {
              return { ok: false, blocked: true, message: 'A restricted bank action was blocked.', errorCode: 'guardrail_violation' }
            }
            await label.click({ timeout: 10_000 })
          } else {
            await locator.check({ timeout: 10_000 })
          }
        } finally { await handle.dispose() }
      }
      if (!await locator.isChecked()) return { ok: false, message: 'The bank did not select that export option.', errorCode: 'option_mismatch' }
      return { ok: true, message: 'Confirmed the selected export option.' }
    }
    if (action.action === 'select_option') {
      if (element.tag !== 'select' || !action.option) return { ok: false, message: 'That option is no longer available.', errorCode: 'option_mismatch' }
      try { await locator.selectOption({ label: action.option }, { timeout: 10_000 }) } catch {
        return { ok: false, message: 'That option is no longer available.', errorCode: 'option_mismatch' }
      }
      return { ok: true, message: 'Selected the requested export option.' }
    }
    if (action.action === 'fill_date') {
      if (element.tag !== 'input' || !['date', 'text'].includes(element.type ?? '') || !action.dateField) {
        return { ok: false, message: 'That date field is no longer available.', errorCode: 'not_date_field' }
      }
      const label = `${element.text} ${element.ariaLabel ?? ''} ${element.placeholder ?? ''}`.toLowerCase()
      if (action.dateField === 'from' && /\b(to|through|end|until|bis)\b/.test(label)) {
        return { ok: false, message: 'The selected field is not the start date.', errorCode: 'date_field_mismatch' }
      }
      if (action.dateField === 'to' && /\b(from|start|since|von)\b/.test(label)) {
        return { ok: false, message: 'The selected field is not the end date.', errorCode: 'date_field_mismatch' }
      }
      const iso = action.dateField === 'from' ? from : to
      if (!isIsoDate(iso)) return { ok: false, message: 'The requested date is invalid.', errorCode: 'date_not_accepted' }
      const inputFormat = inferBankDateFormat(`${element.placeholder ?? ''} ${element.text} ${element.ariaLabel ?? ''}`)
      const format = element.type === 'date' ? 'ISO' as const : inputFormat ?? bank.dateFormat
      const value = formatBankDate(iso, format)
      let readback: string
      try {
        if (element.type === 'date') {
          await locator.fill(value, { timeout: 10_000 })
        } else {
          // Text widgets can display fill()'s value without committing their keyboard-driven export state.
          // Triple-click selects the full field without assuming the remote browser shares our OS.
          await locator.click({ clickCount: 3, timeout: 10_000 })
          const selected = await locator.evaluate(input => {
            const field = input as HTMLInputElement
            return !field.readOnly && !field.disabled && field.selectionStart === 0 && field.selectionEnd === field.value.length
          })
          if (!selected) return { ok: false, message: 'The bank date field could not be selected safely.', errorCode: 'date_fill_failed' }
          await locator.pressSequentially(value, { delay: 60, timeout: 10_000 })
        }
        readback = await locator.inputValue()
        await locator.press('Tab', { timeout: 10_000 })
        // Native date controls tab through day/month/year segments before leaving the input.
        if (element.type === 'date') {
          for (let i = 0; i < 3 && await locator.evaluate(input => input.matches(':focus')); i++) {
            await locator.press('Tab', { timeout: 10_000 })
          }
        }
      } catch {
        return { ok: false, message: 'The bank date field rejected input.', errorCode: 'date_fill_failed' }
      }
      // Some bank forms validate on blur and silently revert or clear the field. The readback above
      // happens before Tab, so re-read after the blur settles and fail loudly if the bank changed it.
      await page.waitForTimeout(500)
      if (await locator.evaluate(input => input.matches(':focus')).catch(() => true)) {
        return { ok: false, message: 'The bank date field did not finish editing. Please choose the date manually.', errorCode: 'date_not_accepted' }
      }
      const settled = await locator.inputValue().catch(() => '')
      if (settled !== readback && parseBankDate(settled, format) !== iso) {
        return { ok: false, message: 'The bank changed or cleared the date after it was entered.', errorCode: 'date_reverted_after_blur' }
      }
      readback = settled
      if (parseBankDate(readback, format) !== iso) {
        return { ok: false, message: 'The bank did not accept the requested date.', errorCode: 'date_not_accepted' }
      }
      return { ok: true, message: `Set the ${action.dateField} date.`, verifiedValue: readback }
    }

    await locator.click({ timeout: 10_000 })
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(1200)
    return {
      ok: true,
      message: action.action === 'download' ? 'Started the CSV download.' : 'Completed the bank navigation step.',
      expectDownload: action.action === 'download',
    }
  } catch {
    return { ok: false, message: 'The bank page did not accept that action.', errorCode: 'bank_action_failed' }
  }
}
