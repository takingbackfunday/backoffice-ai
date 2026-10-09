import { describe, expect, it } from 'vitest'
import { getBank } from '@/lib/bank-import/banks'
import { buildUserMessage } from './navigator'
import type { PageSnapshot } from './page-elements'

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
})
