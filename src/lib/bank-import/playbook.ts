export const PLAYBOOK_VERSION = 1

export const PLAYBOOK_INTENTS = [
  'open_navigation_menu',
  'open_selected_account',
  'open_transaction_activity',
  'open_export_options',
  'select_csv',
  'choose_date_range',
  'set_date_from',
  'set_date_to',
  'download_csv',
] as const

export type PlaybookIntent = (typeof PLAYBOOK_INTENTS)[number]

export const PLAYBOOK_POSTCONDITIONS = [
  'navigation_menu_visible',
  'account_selected',
  'activity_visible',
  'export_options_visible',
  'csv_selected',
  'date_range_controls_visible',
  'from_date_set',
  'to_date_set',
  'csv_downloaded',
] as const

export type PlaybookPostcondition = (typeof PLAYBOOK_POSTCONDITIONS)[number]
// Fixed cues retain useful menu choices without storing bank labels or account details.
export const PLAYBOOK_TARGETS = ['menu', 'more', 'account_services', 'statements_documents', 'download_activity', 'export', 'custom_range'] as const
export type PlaybookTarget = (typeof PLAYBOOK_TARGETS)[number]
export interface PlaybookStep { intent: PlaybookIntent; expected: PlaybookPostcondition; target?: PlaybookTarget }

export const PLAYBOOK_TARGET_HINTS: Record<PlaybookTarget, string> = {
  menu: 'Open the navigation/account menu.',
  more: 'Open More / More options / the overflow menu.',
  account_services: 'Open Account services / Account options.',
  statements_documents: 'Open Statements and documents / Downloads.',
  download_activity: 'Open Download account activity / Download transactions.',
  export: 'Open Export / Download CSV / the download icon.',
  custom_range: 'Select Choose a date range / Custom date range.',
}

const TARGET_INTENTS: Record<PlaybookTarget, PlaybookIntent[]> = {
  menu: ['open_navigation_menu'],
  more: ['open_navigation_menu'],
  account_services: ['open_navigation_menu'],
  statements_documents: ['open_export_options'],
  download_activity: ['open_export_options'],
  export: ['open_export_options', 'download_csv'],
  custom_range: ['choose_date_range'],
}

const EXPECTED_BY_INTENT: Record<PlaybookIntent, PlaybookPostcondition> = {
  open_navigation_menu: 'navigation_menu_visible',
  open_selected_account: 'account_selected',
  open_transaction_activity: 'activity_visible',
  open_export_options: 'export_options_visible',
  select_csv: 'csv_selected',
  choose_date_range: 'date_range_controls_visible',
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
    if (!keys.includes('intent') || !keys.includes('expected') || keys.some(key => !['intent', 'expected', 'target'].includes(key))) return null
    const { intent, expected, target } = step as Record<string, unknown>
    if (typeof intent !== 'string' || !PLAYBOOK_INTENTS.includes(intent as PlaybookIntent)) return null
    if (expected !== EXPECTED_BY_INTENT[intent as PlaybookIntent]) return null
    if (target !== undefined && (typeof target !== 'string' || !PLAYBOOK_TARGETS.includes(target as PlaybookTarget) || !TARGET_INTENTS[target as PlaybookTarget].includes(intent as PlaybookIntent))) return null
    parsed.push({ intent: intent as PlaybookIntent, expected: expected as PlaybookPostcondition, ...(target === undefined ? {} : { target: target as PlaybookTarget }) })
  }
  return parsed
}
