import { analyzeCsv } from '@/lib/csv-structure'
import { parseAmount } from '@/lib/amount'
import { parseDateStructured } from '@/lib/date-format'
import { expectedPostcondition, parsePlaybook, PLAYBOOK_VERSION, type PlaybookStep } from '@/lib/bank-import/playbook'

export function appendExportStep(steps: PlaybookStep[], step: PlaybookStep): void {
  const previous = steps.at(-1)
  if (previous?.intent !== step.intent || previous?.target !== step.target) steps.push(step)
}

export function appendTakeoverSteps(steps: PlaybookStep[], observed: PlaybookStep[]): void {
  for (const step of observed) {
    if (step.intent === 'download_csv') {
      // The observer verifies both current dates at Download. Replay must set fresh
      // session dates even when the human accepted pre-populated date controls.
      for (const intent of ['set_date_from', 'set_date_to'] as const) {
        if (!steps.some(candidate => candidate.intent === intent)) appendExportStep(steps, { intent, expected: expectedPostcondition(intent) })
      }
    }
    appendExportStep(steps, step)
  }
}

export function completeExportFlow(steps: PlaybookStep[]): boolean {
  return !!parsePlaybook(PLAYBOOK_VERSION, steps) && steps.at(-1)?.intent === 'download_csv' &&
    steps.some(step => step.intent === 'set_date_from') && steps.some(step => step.intent === 'set_date_to') &&
    steps.some(step => step.intent === 'open_export_options')
}

/** Training is stricter than capture/review; an HTML error named .csv must never train. */
export function trainableCsv(bytes: Buffer, from: string, to: string): boolean {
  const sample = bytes.subarray(0, 64 * 1024).toString('utf8').replace(/^\uFEFF/, '').trim()
  if (!sample || /[\x00-\x08\x0e-\x1f\ufffd]/.test(sample) || /^(?:<|\{|\[|%PDF)/.test(sample)) return false
  try {
    const csv = analyzeCsv(sample)
    if (csv.headers.length < 2 || csv.rows.length === 0) return false
    let transaction = false
    for (const row of csv.rows.slice(0, 100)) {
      const dates = row.map(value => parseDateStructured(value)?.toISOString().slice(0, 10)).filter((date): date is string => date !== undefined)
      if (dates.some(date => date < from || date > to)) return false
      if (dates.length && row.some(value => parseAmount(value, false) !== null)) transaction = true
    }
    return transaction
  } catch {
    return false
  }
}
