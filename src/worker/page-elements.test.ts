import { describe, expect, it } from 'vitest'
import { isCsvSelected, type PageElement } from './page-elements'

const radio: PageElement = { id: 0, frameIndex: 0, tag: 'input', type: 'radio', text: 'CSV', disabled: false }

describe('isCsvSelected', () => {
  it('requires CSV to be checked, not merely available', () => {
    expect(isCsvSelected({ elements: [radio] })).toBe(false)
    expect(isCsvSelected({ elements: [{ ...radio, checked: false }] })).toBe(false)
    expect(isCsvSelected({ elements: [{ ...radio, checked: true }] })).toBe(true)
  })

  it('accepts a checked radio with a CSV accessible label', () => {
    expect(isCsvSelected({ elements: [{ ...radio, text: '', ariaLabel: 'CSV format', checked: true }] })).toBe(true)
  })

  it('does not mistake selected PDF or a download button for CSV selection', () => {
    expect(isCsvSelected({ elements: [{ ...radio, text: 'PDF', checked: true }, radio] })).toBe(false)
    expect(isCsvSelected({ elements: [{ ...radio, tag: 'button', text: 'Download CSV', checked: true }] })).toBe(false)
  })

  it('checks the selected dropdown value, not its available options', () => {
    const select = { ...radio, tag: 'select', value: 'PDF', options: ['PDF', 'Spreadsheet (CSV)'] }
    expect(isCsvSelected({ elements: [select] })).toBe(false)
    expect(isCsvSelected({ elements: [{ ...select, value: 'Spreadsheet (CSV)' }] })).toBe(true)
    expect(isCsvSelected({ elements: [{ ...select, value: 'Excel' }] })).toBe(false)
  })
})
