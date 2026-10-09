export const PLAYBOOK_VERSION = 1

export const PLAYBOOK_INTENTS = [
  'open_selected_account',
  'open_transaction_activity',
  'open_export_options',
  'select_csv',
  'set_date_from',
  'set_date_to',
  'download_csv',
] as const

export type PlaybookIntent = (typeof PLAYBOOK_INTENTS)[number]

export const PLAYBOOK_POSTCONDITIONS = [
  'account_selected',
  'activity_visible',
  'export_options_visible',
  'csv_selected',
  'from_date_set',
  'to_date_set',
  'csv_downloaded',
] as const

export type PlaybookPostcondition = (typeof PLAYBOOK_POSTCONDITIONS)[number]
export interface PlaybookStep { intent: PlaybookIntent; expected: PlaybookPostcondition }

const EXPECTED_BY_INTENT: Record<PlaybookIntent, PlaybookPostcondition> = {
  open_selected_account: 'account_selected',
  open_transaction_activity: 'activity_visible',
  open_export_options: 'export_options_visible',
  select_csv: 'csv_selected',
  set_date_from: 'from_date_set',
  set_date_to: 'to_date_set',
  download_csv: 'csv_downloaded',
}

export function expectedPostcondition(intent: PlaybookIntent): PlaybookPostcondition {
  return EXPECTED_BY_INTENT[intent]
}

export function parsePlaybook(version: unknown, steps: unknown): PlaybookStep[] | null {
  if (version !== PLAYBOOK_VERSION || !Array.isArray(steps) || steps.length === 0 || steps.length > 25) return null
  const parsed: PlaybookStep[] = []
  for (const step of steps) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return null
    const keys = Object.keys(step)
    if (keys.length !== 2 || !keys.includes('intent') || !keys.includes('expected')) return null
    const { intent, expected } = step as Record<string, unknown>
    if (typeof intent !== 'string' || !PLAYBOOK_INTENTS.includes(intent as PlaybookIntent)) return null
    if (expected !== EXPECTED_BY_INTENT[intent as PlaybookIntent]) return null
    parsed.push({ intent: intent as PlaybookIntent, expected: expected as PlaybookPostcondition })
  }
  return parsed
}
