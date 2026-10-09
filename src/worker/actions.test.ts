import { describe, expect, it, vi } from 'vitest'
import type { Locator, Page } from 'playwright-core'
import { getBank } from '@/lib/bank-import/banks'
import { executeAction } from './actions'
import type { PageElement, PageSnapshot } from './page-elements'

function fixture(checked = false, labelVisible = true, labelText = 'CSV') {
  const label = { isVisible: vi.fn().mockResolvedValue(labelVisible), innerText: vi.fn().mockResolvedValue(labelText), getAttribute: vi.fn().mockResolvedValue(null), click: vi.fn().mockResolvedValue(undefined) }
  const handle = { asElement: () => label, dispose: vi.fn().mockResolvedValue(undefined) }
  const locator = { isChecked: vi.fn().mockResolvedValueOnce(checked).mockResolvedValue(true), evaluateHandle: vi.fn().mockResolvedValue(handle), check: vi.fn().mockResolvedValue(undefined), click: vi.fn() }
  const element: PageElement = { id: 1, frameIndex: 0, tag: 'input', type: 'radio', text: 'CSV', disabled: false }
  const snap: PageSnapshot = { url: 'https://app.n26.com/export', title: '', textExcerpt: '', elements: [element], frameCount: 1, snapshotFailureCount: 0, locate: () => locator as unknown as Locator }
  const run = () => executeAction({ page: {} as Page, snap, action: { action: 'click', elementId: 1, intent: 'select_csv', reason: 'Select CSV' }, bank: getBank('n26')!, from: '2026-09-01', to: '2026-10-01' })
  return { locator, label, handle, run }
}

describe('native export radio selection', () => {
  it('does not click or scroll a radio that is already checked', async () => {
    const { run, locator } = fixture(true)
    expect(await run()).toMatchObject({ ok: true })
    expect(locator.evaluateHandle).not.toHaveBeenCalled()
    expect(locator.click).not.toHaveBeenCalled()
    expect(locator.check).not.toHaveBeenCalled()
  })

  it('uses the native associated label for a styled radio and verifies selection', async () => {
    const { run, locator, label, handle } = fixture()
    expect(await run()).toMatchObject({ ok: true })
    expect(label.click).toHaveBeenCalledWith({ timeout: 10_000 })
    expect(locator.click).not.toHaveBeenCalled()
    expect(locator.isChecked).toHaveBeenCalledTimes(2)
    expect(handle.dispose).toHaveBeenCalledOnce()
  })

  it('uses native check when there is no visible label', async () => {
    const { run, locator, label, handle } = fixture(false, false)
    expect(await run()).toMatchObject({ ok: true })
    expect(locator.check).toHaveBeenCalledWith({ timeout: 10_000 })
    expect(label.click).not.toHaveBeenCalled()
    expect(handle.dispose).toHaveBeenCalledOnce()
  })

  it('rejects a click that did not actually select the radio', async () => {
    const { run, locator } = fixture()
    locator.isChecked.mockReset().mockResolvedValue(false)
    expect(await run()).toMatchObject({ ok: false, errorCode: 'option_mismatch' })
  })

  it('rechecks the associated label against the safety policy', async () => {
    const { run, label, handle } = fixture(false, true, 'Transfer money')
    expect(await run()).toMatchObject({ ok: false, blocked: true, errorCode: 'guardrail_violation' })
    expect(label.click).not.toHaveBeenCalled()
    expect(handle.dispose).toHaveBeenCalledOnce()
  })

  it('disposes the label handle and returns a sanitized failure if clicking times out', async () => {
    const { run, label, handle } = fixture()
    label.click.mockRejectedValue(new Error('sensitive bank page details'))
    const result = await run()
    expect(result).toMatchObject({ ok: false, errorCode: 'bank_action_failed' })
    expect(JSON.stringify(result)).not.toContain('sensitive')
    expect(handle.dispose).toHaveBeenCalledOnce()
  })
})

describe('date field format hints', () => {
  it('uses the visible DD/MM/YYYY hint instead of the bank fallback format', async () => {
    const locator = {
      fill: vi.fn().mockResolvedValue(undefined),
      inputValue: vi.fn().mockResolvedValue('01/09/2026'),
      press: vi.fn().mockResolvedValue(undefined),
    }
    const element: PageElement = { id: 7, frameIndex: 0, tag: 'input', type: 'text', text: '', placeholder: 'DD/MM/YYYY', disabled: false }
    const snap: PageSnapshot = { url: 'https://app.n26.com/export', title: '', textExcerpt: '', elements: [element], frameCount: 1, snapshotFailureCount: 0, locate: () => locator as unknown as Locator }
    const result = await executeAction({
      page: {} as Page,
      snap,
      action: { action: 'fill_date', elementId: 7, dateField: 'from', intent: 'set_date_from', reason: 'Set start date' },
      bank: getBank('n26')!,
      from: '2026-09-01',
      to: '2026-10-09',
    })

    expect(locator.fill).toHaveBeenCalledWith('01/09/2026', { timeout: 10_000 })
    expect(result).toMatchObject({ ok: true, verifiedValue: '01/09/2026' })
  })
})
