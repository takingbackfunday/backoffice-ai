import { describe, expect, it, vi } from 'vitest'
import { getBank } from '@/lib/bank-import/banks'
import { buildUserMessage, decideNextAction, resolvePlaybookStep, type AgentAction } from './navigator'
import type { PageSnapshot } from './page-elements'

const llm = vi.hoisted(() => vi.fn())
vi.mock('@/lib/llm/openrouter', () => ({
  DEEPSEEK_MODEL: 'deepseek/deepseek-v4.1-flash-1017',
  openrouterWithTools: llm,
}))

const snapshot: PageSnapshot = {
  url: 'https://secure.chase.com/accounts/activity?secret=hidden#/activity',
  title: 'Checking',
  textExcerpt: 'x'.repeat(1800),
  elements: [{ id: 3, frameIndex: 0, tag: 'button', text: 'Download CSV', disabled: false }],
  frameCount: 1,
  snapshotFailureCount: 0,
  locate: () => null,
}

describe('buildUserMessage', () => {
  it('includes safe navigation context, dates, and elements while limiting page text', () => {
    const message = buildUserMessage({
      bank: getBank('chase')!, accountName: 'Checking', from: '2026-09-01', to: '2026-10-01',
      snapshot, history: [], notes: [],
    })
    expect(message).toContain('https://secure.chase.com/accounts/activity#/activity')
    expect(message).toContain('2026-09-01 to 2026-10-01')
    expect(message).toContain('[3] button "Download CSV"')
    expect(message).not.toContain('secret=hidden')
    expect(message).toContain(`${'x'.repeat(1500)}\n"""`)
    expect(message).not.toContain(`${'x'.repeat(1501)}\n"""`)
  })

  it('shows actual radio selection so the navigator can proceed to download', () => {
    const message = buildUserMessage({
      bank: getBank('n26')!, accountName: 'Main', from: '2026-09-01', to: '2026-10-01',
      snapshot: { ...snapshot, elements: [
        { id: 1, frameIndex: 0, tag: 'input', type: 'radio', text: 'CSV', checked: true, disabled: false },
        { id: 2, frameIndex: 0, tag: 'input', type: 'radio', text: 'PDF', checked: false, disabled: false },
        { id: 3, frameIndex: 0, tag: 'button', text: 'Download', disabled: false },
      ] }, history: [], notes: [],
    })
    expect(message).toContain('[1] input(radio) "CSV" (checked)')
    expect(message).toContain('[2] input(radio) "PDF" (not checked)')
    expect(message).toContain('[3] button "Download"')
  })

  it('uses the remembered fixed menu cue when resolving a new live target', async () => {
    llm.mockResolvedValue({ tool_calls: [{ function: { name: 'next_action', arguments: JSON.stringify({ action: 'click', elementId: 3, reason: 'Open More options', intent: 'open_navigation_menu' }) } }] })
    const result = await resolvePlaybookStep({
      bank: getBank('chase')!, accountName: 'Checking', from: '2026-09-01', to: '2026-10-01', snapshot, history: [], notes: [],
    }, { intent: 'open_navigation_menu', expected: 'navigation_menu_visible', target: 'more' })
    expect(result.action?.intent).toBe('open_navigation_menu')
    expect(llm.mock.calls.at(-1)![0][0].content).toContain('Open More / More options / the overflow menu.')
  })

  it('shows full calendar day names alongside duplicate short day numbers and read-only fields', () => {
    const message = buildUserMessage({
      bank: getBank('n26')!, accountName: 'Main', from: '2026-09-01', to: '2026-10-01',
      snapshot: { ...snapshot, elements: [
        { id: 1, frameIndex: 0, tag: 'input', text: 'From date', domId: 'private-dom-identity', value: '01/09/2026', readOnly: true, disabled: false },
        { id: 2, frameIndex: 0, tag: 'div', role: 'gridcell', text: '1', ariaLabel: 'September 1, 2026', disabled: false },
        { id: 3, frameIndex: 0, tag: 'div', role: 'gridcell', text: '1', ariaLabel: 'October 1, 2026', disabled: true },
      ] }, history: [], notes: [],
    })
    expect(message).toContain('(read-only; use calendar)')
    expect(message).not.toContain('private-dom-identity')
    expect(message).toContain('[2] gridcell "1" aria-label="September 1, 2026"')
    expect(message).toContain('[3] gridcell "1" aria-label="October 1, 2026" (disabled)')
  })
})

describe('calendar action validation and replay', () => {
  const input = { bank: getBank('n26')!, accountName: 'Main', from: '2026-09-01', to: '2026-10-01', snapshot, history: [], notes: [] }
  const opening: AgentAction = { action: 'click', elementId: 1, dateField: 'from', intent: 'set_date_from', reason: 'Open start date calendar' }
  function respond(action: object) {
    llm.mockResolvedValue({ tool_calls: [{ function: { name: 'next_action', arguments: JSON.stringify(action) } }] })
  }

  it.each([
    opening,
    { ...opening, elementId: 4, dateInputId: 1, reason: 'Choose the requested day' },
    { ...opening, action: 'select_option', elementId: 2, option: 'September', reason: 'Choose the month' },
    { ...opening, dateField: 'to', intent: 'set_date_to', reason: 'Open end date calendar' },
  ])('accepts calendar subactions without replacing persisted dates: $reason', async action => {
    respond(action)
    expect((await decideNextAction(input)).action).toEqual(action)
  })

  it('replays a saved date intent as calendar clicks and prompts for calendar-first selection', async () => {
    respond(opening)
    expect((await resolvePlaybookStep(input, { intent: 'set_date_from', expected: 'from_date_set' })).action).toEqual(opening)
    const prompt = llm.mock.calls.at(-1)![0][0].content
    expect(prompt).toContain("Prefer selecting dates by clicking the bank's date picker")
    expect(prompt).toContain('opening a picker is NOT a completed date selection')
    expect(prompt).toContain('do not switch to typing after a failed calendar selection')
    expect(prompt).toContain('Use fill_date (from/to) only when no usable calendar is available')
  })

  it.each([
    { ...opening, dateField: undefined },
    { ...opening, dateField: 'to' },
    { ...opening, intent: 'other' },
    { ...opening, action: 'wait' },
    { ...opening, dateInputId: 1 },
    { ...opening, action: 'select_option', option: 'September', dateInputId: 3 },
    { ...opening, action: 'fill_date', dateInputId: 3 },
    { ...opening, dateInputId: -1 },
    { action: 'click', elementId: 3, dateInputId: 1, reason: 'Choose day', intent: 'other' },
  ])('rejects malformed date selection %#', async action => {
    respond(action)
    expect((await resolvePlaybookStep(input, { intent: 'set_date_from', expected: 'from_date_set' })).action).toBeNull()
  })
})
