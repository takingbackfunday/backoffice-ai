import { describe, expect, it } from 'vitest'
import { computeAiMappingChanges } from '@/lib/ai-mapping-changes'

const mapping = { dateCol: 'Date', amountCol: 'Amount', descCol: 'Description', amountSign: 'normal' as const }

describe('computeAiMappingChanges', () => {
  it('applies suggestions at 99 confidence but not below it', () => {
    const changes = computeAiMappingChanges(mapping, {
      dateCol: { col: 'Posted', confidence: 99 },
      amountCol: { col: 'Value', confidence: 98 },
    }, new Set(), ['Date', 'Posted', 'Amount', 'Value', 'Description'])
    expect(changes).toEqual([{ field: 'dateCol', from: 'Date', to: 'Posted' }])
  })

  it('ignores unknown columns and fields the user touched', () => {
    expect(computeAiMappingChanges(mapping, {
      dateCol: { col: 'Unknown', confidence: 100 },
      amountCol: { col: 'Value', confidence: 100 },
    }, new Set(['amountCol']), ['Date', 'Amount', 'Value', 'Description'])).toEqual([])
  })

  it('does not report no-op changes and retains the prior value for Undo', () => {
    expect(computeAiMappingChanges(mapping, {
      dateCol: { col: 'Date', confidence: 100 },
      descCol: { col: 'Memo', confidence: 100 },
      notesCol: { col: 'Notes', confidence: 100 },
    }, new Set(), ['Date', 'Amount', 'Description', 'Memo', 'Notes'])).toEqual([
      { field: 'descCol', from: 'Description', to: 'Memo' },
      { field: 'notesCol', from: undefined, to: 'Notes' },
    ])
  })

  it('never changes amountCol in split mode or applies null columns', () => {
    expect(computeAiMappingChanges({ ...mapping, amountMode: 'split' }, {
      amountCol: { col: 'Value', confidence: 100 },
      descCol: { col: null, confidence: 100 },
    }, new Set(), ['Amount', 'Value', 'Description'])).toEqual([])
  })
})
