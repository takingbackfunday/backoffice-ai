'use client'

import { useState, type MutableRefObject } from 'react'
import { isSplitMapping, type CsvMapping } from '@/lib/csv-processor'
import { scoreCandidates, type MappedField } from '@/lib/guess-mapping'
import { ColSelect, type MappingValidation } from './col-select'

export function AmountFields({
  mapping,
  setMapping,
  touchedRef,
  headers,
  validation,
  candidates,
  detectedSplit,
  samples,
  aiPendingFields,
  clearAiField,
}: {
  mapping: Partial<CsvMapping>
  setMapping: React.Dispatch<React.SetStateAction<Partial<CsvMapping>>>
  touchedRef: MutableRefObject<Set<string>>
  headers: string[]
  validation: MappingValidation | null
  candidates: Record<MappedField, { col: string; score: number }[]>
  detectedSplit: boolean
  samples: Record<string, string>
  aiPendingFields: ReadonlySet<string>
  clearAiField: (field: string) => void
}) {
  const [signSuggestionDismissed, setSignSuggestionDismissed] = useState(false)
  const [modeTouched, setModeTouched] = useState(false)
  const split = isSplitMapping(mapping)
  const suggestedSign = validation?.amountSign
  const showSignSuggestion =
    !split &&
    !signSuggestionDismissed &&
    !!suggestedSign &&
    suggestedSign.confidence >= 90 &&
    (suggestedSign.value === 'normal' || suggestedSign.value === 'inverted') &&
    suggestedSign.value !== (mapping.amountSign ?? 'normal')

  const changeMode = (amountMode: 'single' | 'split') => {
    touchedRef.current.add('amountMode')
    setModeTouched(true)
    if (amountMode === 'split') clearAiField('amountCol')
    setMapping((m) => ({
      ...m,
      amountMode,
      ...(amountMode === 'split' ? {
        debitCol: m.debitCol ?? scoreCandidates(headers, 'debitCol')[0]?.col,
        creditCol: m.creditCol ?? scoreCandidates(headers, 'creditCol')[0]?.col,
      } : {}),
    }))
  }

  return (
    <>
      <div>
        <p className="block text-xs font-medium mb-1">Amount format</p>
        <div className="grid grid-cols-2 rounded-md border p-0.5" role="group" aria-label="Amount format">
          {([
            ['single', 'One amount column'],
            ['split', 'Separate money out / money in columns'],
          ] as const).map(([mode, label]) => (
            <button key={mode} type="button" aria-pressed={split === (mode === 'split')}
              onClick={() => changeMode(mode)}
              className={`rounded px-2 py-1.5 text-xs ${split === (mode === 'split') ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {split ? (
        <>
          <ColSelect id="select-debitCol" label="Money out (debit) column *" value={mapping.debitCol} headers={headers}
            onChange={(value) => { touchedRef.current.add('debitCol'); setMapping((m) => ({ ...m, debitCol: value })) }}
            candidates={candidates.debitCol} samples={samples} required />
          <ColSelect id="select-creditCol" label="Money in (credit) column *" value={mapping.creditCol} headers={headers}
            onChange={(value) => { touchedRef.current.add('creditCol'); setMapping((m) => ({ ...m, creditCol: value })) }}
            candidates={candidates.creditCol} samples={samples} required />
          {mapping.debitCol && mapping.creditCol && mapping.debitCol === mapping.creditCol && (
            <p className="text-xs text-red-600">Money out and money in must be different columns.</p>
          )}
          {detectedSplit && !modeTouched && (
            <p className="text-xs text-muted-foreground">Detected separate money out / money in columns.</p>
          )}
        </>
      ) : (
        <>
          <ColSelect id="select-amountCol" label="Amount column *" value={mapping.amountCol} headers={headers}
            onChange={(value) => { touchedRef.current.add('amountCol'); setMapping((m) => ({ ...m, amountCol: value })) }}
            onUserChange={() => clearAiField('amountCol')}
            validation={validation?.amountCol} candidates={candidates.amountCol} samples={samples}
            aiChanged={aiPendingFields.has('amountCol')} required />
          <div>
            <label htmlFor="select-amountSign" className="block text-xs font-medium mb-1">Amount sign *</label>
            <select id="select-amountSign" value={mapping.amountSign ?? 'normal'}
              onChange={(e) => {
                touchedRef.current.add('amountSign')
                setMapping((m) => ({ ...m, amountSign: e.target.value as 'normal' | 'inverted' }))
              }}
              className="w-full rounded-md border px-3 py-1.5 text-sm" data-testid="select-amountSign">
              {(['normal', 'inverted'] as const).map((v) => {
                const label = v === 'normal' ? 'Expenses are negative' : 'Expenses are positive'
                const aiPct = validation?.amountSign?.value === v ? validation.amountSign.confidence : null
                return <option key={v} value={v}>{label}{aiPct ? ` — ${aiPct}%` : ''}</option>
              })}
            </select>
          </div>
          {showSignSuggestion && suggestedSign && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-1.5" data-testid="sign-suggestion">
              <p className="text-xs text-amber-900">
                AI thinks {suggestedSign.value === 'inverted' ? 'expenses are positive' : 'expenses are negative'} in this file ({suggestedSign.confidence}%).
              </p>
              <div className="flex gap-2">
                <button type="button" className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white"
                  onClick={() => { touchedRef.current.add('amountSign'); setMapping((m) => ({ ...m, amountSign: suggestedSign.value as 'normal' | 'inverted' })) }}>
                  Switch
                </button>
                <button type="button" className="text-xs text-amber-900 hover:underline" onClick={() => setSignSuggestionDismissed(true)}>
                  Keep current
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
