import { describe, expect, it, vi } from 'vitest'
import type { Locator, Page } from 'playwright-core'
import { getBank } from '@/lib/bank-import/banks'
import { executeAction } from './actions'
import type { AgentAction } from './navigator'
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
  function dateFixture(inputValues: string[], from = '2026-09-01') {
    const locator = {
      fill: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(false),
      pressSequentially: vi.fn().mockResolvedValue(undefined),
      inputValue: vi.fn(),
      press: vi.fn().mockResolvedValue(undefined),
    }
    for (const value of inputValues) locator.inputValue.mockResolvedValueOnce(value)
    locator.inputValue.mockResolvedValue(inputValues[inputValues.length - 1] ?? '')
    locator.evaluate.mockResolvedValueOnce(true)
    const element: PageElement = { id: 7, frameIndex: 0, tag: 'input', type: 'text', text: '', placeholder: 'DD/MM/YYYY', disabled: false }
    const snap: PageSnapshot = { url: 'https://app.n26.com/export', title: '', textExcerpt: '', elements: [element], frameCount: 1, snapshotFailureCount: 0, locate: () => locator as unknown as Locator }
    const page = { waitForTimeout: vi.fn().mockResolvedValue(undefined) } as unknown as Page
    const run = () => executeAction({
      page,
      snap,
      action: { action: 'fill_date', elementId: 7, dateField: 'from', intent: 'set_date_from', reason: 'Set start date' },
      bank: getBank('n26')!,
      from,
      to: '2026-10-09',
    })
    return { locator, element, run }
  }

  it('uses the visible DD/MM/YYYY hint instead of the bank fallback format', async () => {
    const { locator, run } = dateFixture(['01/09/2026'])
    const result = await run()
    expect(locator.fill).not.toHaveBeenCalled()
    expect(locator.click).toHaveBeenCalledWith({ clickCount: 3, timeout: 10_000 })
    expect(locator.pressSequentially).toHaveBeenCalledWith('01/09/2026', { delay: 60, timeout: 10_000 })
    expect(locator.press).toHaveBeenCalledExactlyOnceWith('Tab', { timeout: 10_000 })
    expect(result).toMatchObject({ ok: true, verifiedValue: '01/09/2026' })
  })

  it('keeps native date inputs on ISO fill rather than locale-dependent keystrokes', async () => {
    const { locator, element, run } = dateFixture(['2026-09-01'])
    element.type = 'date'
    locator.evaluate.mockReset().mockResolvedValue(false)
    expect(await run()).toMatchObject({ ok: true, verifiedValue: '2026-09-01' })
    expect(locator.fill).toHaveBeenCalledWith('2026-09-01', { timeout: 10_000 })
    expect(locator.pressSequentially).not.toHaveBeenCalled()
  })

  it('never reports success using a stale pre-blur value if the settled read fails', async () => {
    const { locator, run } = dateFixture(['01/09/2026'])
    locator.inputValue.mockReset().mockResolvedValueOnce('01/09/2026').mockRejectedValue(new Error('sensitive detached input'))
    const result = await run()
    expect(result).toMatchObject({ ok: false, errorCode: 'date_reverted_after_blur' })
    expect(JSON.stringify(result)).not.toContain('sensitive')
  })

  it('fails safely if the commit keystroke fails', async () => {
    const { locator, run } = dateFixture(['01/09/2026'])
    locator.press.mockRejectedValueOnce(new Error('sensitive bank page'))
    const result = await run()
    expect(result).toMatchObject({ ok: false, errorCode: 'date_fill_failed' })
    expect(result.verifiedValue).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('sensitive')
  })

  it('does not type if the widget will not select the previous date', async () => {
    const { locator, run } = dateFixture(['01/09/2026'])
    locator.evaluate.mockReset().mockResolvedValue(false)
    expect(await run()).toMatchObject({ ok: false, errorCode: 'date_fill_failed' })
    expect(locator.pressSequentially).not.toHaveBeenCalled()
  })

  it('does not verify dates while the text widget still has focus', async () => {
    const { locator, run } = dateFixture(['01/09/2026'])
    locator.evaluate.mockReset().mockResolvedValue(true)
    expect(await run()).toMatchObject({ ok: false, errorCode: 'date_not_accepted' })
  })

  it('fails safely if focus verification is unavailable', async () => {
    const { locator, run } = dateFixture(['01/09/2026'])
    locator.evaluate.mockReset().mockResolvedValueOnce(true).mockRejectedValue(new Error('sensitive page'))
    const result = await run()
    expect(result).toMatchObject({ ok: false, errorCode: 'date_not_accepted' })
    expect(JSON.stringify(result)).not.toContain('sensitive')
  })

  it.each(['2026-02-30', '01/09/2026', 'not-a-date'])('rejects invalid runtime date %s before interacting', async from => {
    const { locator, run } = dateFixture([], from)
    expect(await run()).toMatchObject({ ok: false, errorCode: 'date_not_accepted' })
    expect(locator.fill).not.toHaveBeenCalled()
    expect(locator.click).not.toHaveBeenCalled()
    expect(locator.pressSequentially).not.toHaveBeenCalled()
  })

  it.each([
    ['MM/DD/YYYY', '09/01/2026'], ['DD.MM.YYYY', '01.09.2026'], ['DD/MM/YYYY', '01/09/2026'],
  ])('preserves %s hints during keyboard entry', async (placeholder, value) => {
    const { locator, element, run } = dateFixture([value])
    element.placeholder = placeholder
    expect(await run()).toMatchObject({ ok: true, verifiedValue: value })
    expect(locator.pressSequentially).toHaveBeenCalledWith(value, { delay: 60, timeout: 10_000 })
  })

  it('fails with date_reverted_after_blur when the bank clears the field after Tab', async () => {
    const { run } = dateFixture(['01/09/2026', ''])
    expect(await run()).toMatchObject({ ok: false, errorCode: 'date_reverted_after_blur' })
  })

  it('fails with date_reverted_after_blur when the bank reverts to a different date after Tab', async () => {
    const { run } = dateFixture(['01/09/2026', '09/10/2026'])
    expect(await run()).toMatchObject({ ok: false, errorCode: 'date_reverted_after_blur' })
  })

  it('accepts a harmless single-digit reformat of the same date after Tab', async () => {
    const { run } = dateFixture(['01/09/2026', '1/9/2026'])
    expect(await run()).toMatchObject({ ok: true, verifiedValue: '1/9/2026' })
  })
})

describe('calendar date selection', () => {
  function calendarFixture(value = '01/09/2026') {
    const day = { click: vi.fn().mockResolvedValue(undefined), selectOption: vi.fn().mockResolvedValue(undefined) }
    const input = { inputValue: vi.fn().mockResolvedValue(value), fill: vi.fn(), pressSequentially: vi.fn() }
    const dateElement: PageElement = { id: 0, frameIndex: 0, tag: 'input', type: 'text', text: 'From date', placeholder: 'DD/MM/YYYY', value: '08/10/2026', readOnly: true, disabled: false }
    const dayElement: PageElement = { id: 1, frameIndex: 0, tag: 'button', text: '1', ariaLabel: 'September 1, 2026', disabled: false }
    const snap: PageSnapshot = { url: 'https://app.n26.com/export', title: '', textExcerpt: '', elements: [dateElement, dayElement], frameCount: 1, snapshotFailureCount: 0,
      locate: id => (id === 0 ? input : day) as unknown as Locator }
    const page = { waitForTimeout: vi.fn().mockResolvedValue(undefined) } as unknown as Page
    const action: AgentAction = { action: 'click', elementId: 1, dateInputId: 0, dateField: 'from', intent: 'set_date_from', reason: 'Select the start day' }
    const run = (from = '2026-09-01') => executeAction({ page, snap, action, bank: getBank('n26')!, from, to: '2026-10-09' })
    return { run, action, day, input, dateElement, dayElement }
  }

  it('clicks a calendar day and verifies the associated read-only input without typing', async () => {
    const { run, day, input } = calendarFixture()
    expect(await run()).toMatchObject({ ok: true, verifiedValue: '01/09/2026' })
    expect(day.click).toHaveBeenCalledExactlyOnceWith({ timeout: 10_000 })
    expect(input.fill).not.toHaveBeenCalled()
    expect(input.pressSequentially).not.toHaveBeenCalled()
  })

  it('accepts an ISO calendar readback from a text input with a localized placeholder', async () => {
    const { run } = calendarFixture('2026-09-01')
    expect(await run()).toMatchObject({ ok: true, verifiedValue: '2026-09-01' })
  })

  it('never verifies an intermediate click even if the current date already matches', async () => {
    const { run, action, input } = calendarFixture()
    delete action.dateInputId
    expect(await run()).toMatchObject({ ok: true })
    expect((await run()).verifiedValue).toBeUndefined()
    expect(input.inputValue).not.toHaveBeenCalled()
  })

  it('supports month/year dropdown navigation without completing the date intent', async () => {
    const { run, action, day, dayElement } = calendarFixture()
    delete action.dateInputId
    action.action = 'select_option'
    action.option = 'September'
    dayElement.tag = 'select'
    expect(await run()).toMatchObject({ ok: true })
    expect(day.selectOption).toHaveBeenCalledWith({ label: 'September' }, { timeout: 10_000 })
    expect(day.click).not.toHaveBeenCalled()
  })

  it.each(['02/09/2026', '', '09/01/2026', '2026-09-02', '2026-02-30'])('rejects a settled calendar value that differs from the requested date: %s', async value => {
    const { run } = calendarFixture(value)
    expect(await run()).toMatchObject({ ok: false, errorCode: 'date_not_accepted' })
  })

  it('fails safely when the date input disappears after selection', async () => {
    const { run, input } = calendarFixture()
    input.inputValue.mockRejectedValue(new Error('private bank detail'))
    const result = await run()
    expect(result).toMatchObject({ ok: false, errorCode: 'date_not_accepted' })
    expect(JSON.stringify(result)).not.toContain('private')
  })

  it('refuses to verify the end field as the start field', async () => {
    const { run, dateElement, day } = calendarFixture()
    dateElement.text = 'To date'
    expect(await run()).toMatchObject({ ok: false, errorCode: 'date_field_mismatch' })
    expect(day.click).not.toHaveBeenCalled()
  })

  it('cannot mark the date input opener itself as a completed calendar selection', async () => {
    const { run, action } = calendarFixture()
    action.elementId = 0
    expect(await run()).toMatchObject({ ok: false, errorCode: 'not_date_field' })
  })

  it('does not inspect generic input values to verify a date', async () => {
    const { run, dateElement, input, day } = calendarFixture()
    delete dateElement.value
    expect(await run()).toMatchObject({ ok: false, errorCode: 'not_date_field' })
    expect(input.inputValue).not.toHaveBeenCalled()
    expect(day.click).not.toHaveBeenCalled()
  })

  it('preserves native ISO date verification for calendar selection', async () => {
    const { run, dateElement } = calendarFixture('2026-09-01')
    dateElement.type = 'date'
    expect(await run()).toMatchObject({ ok: true, verifiedValue: '2026-09-01' })
  })

  it.each(['disabled', 'restricted', 'invalid-date'])('blocks an unsafe calendar action: %s', async kind => {
    const { run, dayElement, day } = calendarFixture()
    if (kind === 'disabled') dayElement.disabled = true
    if (kind === 'restricted') dayElement.ariaLabel = 'Transfer money'
    expect(await run(kind === 'invalid-date' ? '2026-02-30' : '2026-09-01')).toMatchObject({ ok: false })
    expect(day.click).not.toHaveBeenCalled()
  })
})
