import type { Page } from 'playwright-core'
import { formatBankDate } from '@/lib/bank-import/date-range'
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

  try {
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
      const value = formatBankDate(iso, element.type === 'date' ? 'ISO' : bank.dateFormat)
      let readback: string
      try {
        await locator.fill(value, { timeout: 10_000 })
        readback = await locator.inputValue().catch(() => '')
        if (readback !== value) {
          await locator.click({ timeout: 10_000 })
          await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
          await locator.pressSequentially(value, { delay: 60, timeout: 10_000 })
          readback = await locator.inputValue().catch(() => '')
        }
        await locator.press('Tab').catch(() => {})
      } catch {
        return { ok: false, message: 'The bank date field rejected input.', errorCode: 'date_fill_failed' }
      }
      if (readback !== value) return { ok: false, message: 'The bank did not accept the requested date.', errorCode: 'date_not_accepted' }
      return { ok: true, message: `Set the ${action.dateField} date.`, verifiedValue: value }
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
