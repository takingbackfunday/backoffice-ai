import { describe, expect, it } from 'vitest'
import { expectedPostcondition, parsePlaybook, PLAYBOOK_VERSION } from './playbook'

const steps = [
  { intent: 'open_selected_account', expected: 'account_selected' },
  { intent: 'open_export_options', expected: 'export_options_visible' },
  { intent: 'set_date_from', expected: 'from_date_set' },
]

describe('parsePlaybook', () => {
  it('accepts the supported version and semantic steps', () => {
    expect(parsePlaybook(PLAYBOOK_VERSION, steps)).toEqual(steps)
  })

  it('rejects unsupported versions and intents', () => {
    expect(parsePlaybook(2, steps)).toBeNull()
    expect(parsePlaybook(1, [{ intent: 'click_transfer', expected: 'account_selected' }])).toBeNull()
  })

  it('rejects malformed or sensitive free-form fields', () => {
    expect(parsePlaybook(1, [{ ...steps[0], label: 'Everyday account' }])).toBeNull()
    expect(parsePlaybook(1, [{ intent: 'set_date_from', expected: 'from_date_set', value: '2026-10-01' }])).toBeNull()
    expect(parsePlaybook(1, Array(26).fill(steps[0]))).toBeNull()
  })

  it('maps intents to fixed postconditions', () => {
    expect(expectedPostcondition('download_csv')).toBe('csv_downloaded')
  })
})
