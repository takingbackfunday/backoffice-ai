import { describe, expect, it } from 'vitest'
import { expectedPostcondition, type PlaybookIntent, type PlaybookStep } from '@/lib/bank-import/playbook'
import { appendExportStep, appendTakeoverSteps, completeExportFlow, trainableCsv } from './export-learning'

const step = (intent: PlaybookIntent): PlaybookStep => ({ intent, expected: expectedPostcondition(intent) })

describe('takeover export learning', () => {
  it('retains the verified agent prefix and distinct manual menu choices in order', () => {
    const route = [step('open_selected_account')]
    appendTakeoverSteps(route, [
      { ...step('open_navigation_menu'), target: 'more' },
      { ...step('open_navigation_menu'), target: 'account_services' },
      { ...step('open_export_options'), target: 'download_activity' },
      step('download_csv'),
    ])
    expect(route.map(s => s.intent)).toEqual(['open_selected_account', 'open_navigation_menu', 'open_navigation_menu', 'open_export_options', 'set_date_from', 'set_date_to', 'download_csv'])
    expect(completeExportFlow(route)).toBe(true)
  })

  it('supports manual middle steps followed by agent completion without inventing missing navigation', () => {
    const route = [step('open_selected_account')]
    appendTakeoverSteps(route, [step('open_export_options'), step('set_date_from')])
    expect(completeExportFlow(route)).toBe(false)
    appendExportStep(route, step('set_date_to'))
    appendExportStep(route, step('download_csv'))
    expect(completeExportFlow(route)).toBe(true)
    expect(completeExportFlow([step('download_csv')])).toBe(false)
  })

  it('deduplicates only adjacent identical semantic steps and targets', () => {
    const route: PlaybookStep[] = []
    appendExportStep(route, { ...step('open_navigation_menu'), target: 'more' })
    appendExportStep(route, { ...step('open_navigation_menu'), target: 'more' })
    appendExportStep(route, { ...step('open_navigation_menu'), target: 'menu' })
    expect(route).toHaveLength(2)
  })

  it('does not remember missing date parameters, oversized routes or sensitive fields', () => {
    expect(completeExportFlow([step('open_export_options'), step('set_date_from'), step('download_csv')])).toBe(false)
    expect(completeExportFlow([...Array(26).fill(step('open_export_options')), step('set_date_from'), step('set_date_to'), step('download_csv')])).toBe(false)
    expect(completeExportFlow([{ ...step('open_export_options'), label: 'private' } as PlaybookStep, step('set_date_from'), step('set_date_to'), step('download_csv')])).toBe(false)
  })

  it('accepts plausible CSV transaction data with supported delimiters and preambles', () => {
    for (const data of ['date,amount\n2026-09-03,12.50\n', '\uFEFFdate;amount\n03.09.2026;12,50\n', 'Account summary\nDate,Description,Amount\n2026-09-03,Sample,12.50\n']) {
      expect(trainableCsv(Buffer.from(data), '2026-09-01', '2026-10-09')).toBe(true)
    }
  })

  it.each(['<html>date,amount\n2026-09-03,12.50</html>', '<?xml version="1.0"?>', '{"error":"unauthorized"}', '%PDF-1.7', 'date,amount\n', 'unauthorized\ntry again', 'date,amount\n2026-08-01,12.50\n', '\x00date,amount\n2026-09-03,12.50\n'])('rejects unsafe or contradictory training data (%#)', data => {
    expect(trainableCsv(Buffer.from(data), '2026-09-01', '2026-10-09')).toBe(false)
  })
})
