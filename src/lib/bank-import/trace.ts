import type { PlaybookIntent } from './playbook'
import type { BankImportStatusValue } from './status'

export const TRACE_NAMES = [
  'session.created', 'session.claimed', 'session.state', 'worker.wake', 'browser.profile', 'browser.create', 'browser.connect',
  'auth.poll', 'auth.complete', 'navigation.mode', 'navigation.step', 'navigation.fallback', 'guardrail.block',
  'guardrail.url_violation', 'llm.call', 'download.poll', 'artifact.save', 'browser.logout', 'browser.stop', 'session.terminal', 'session.command',
] as const

export type TraceName = (typeof TRACE_NAMES)[number]
export type TracePhase = 'start' | 'end' | 'event'
export type RouteClass = 'login' | 'dashboard' | 'account' | 'activity' | 'export' | 'other'
export type TraceAuthState = 'login' | 'mfa' | 'authenticated' | 'unknown'
export type NavigationMode = 'learn' | 'replay' | 'fallback' | 'manual'
export type TraceActionKind = 'click' | 'select_option' | 'fill_date' | 'scroll' | 'wait' | 'download' | 'need_user'
export type TraceElementTag = 'a' | 'button' | 'input' | 'select' | 'textarea' | 'summary' | 'other'
export type TraceElementType = 'text' | 'date' | 'search' | 'button' | 'submit' | 'checkbox' | 'radio' | 'number' | 'other'
export type ProviderOperation = 'create_browser' | 'stop_browser' | 'list_downloads' | 'create_profile' | 'delete_profile'
export type TraceOutcome = 'ok' | 'error' | 'blocked' | 'fallback' | 'timeout' | 'cancelled' | 'duplicate' | 'ignored'
export type TraceFileKind = 'csv' | 'txt' | 'xlsx' | 'xls' | 'pdf' | 'other'
export type TraceCommand = 'LOGIN_DONE' | 'TAKEOVER' | 'RESUME_AGENT' | 'CANCEL'

export interface TraceFields {
  workerId?: string
  sessionStatus?: BankImportStatusValue
  commandType?: TraceCommand
  stepIndex?: number
  navigationMode?: NavigationMode
  intent?: PlaybookIntent | 'other'
  actionKind?: TraceActionKind
  elementIndex?: number
  targetTag?: TraceElementTag
  targetType?: TraceElementType
  targetDisabled?: boolean
  authState?: TraceAuthState
  routeBefore?: RouteClass
  routeAfter?: RouteClass
  elementCount?: number
  frameCount?: number
  snapshotFailureCount?: number
  retryCount?: number
  model?: 'anthropic/claude-sonnet-4.6'
  inputTokens?: number
  outputTokens?: number
  toolRounds?: number
  providerOperation?: ProviderOperation
  providerStatus?: number
  fileKind?: TraceFileKind
  fileSizeBytes?: number
  outcome?: TraceOutcome
  errorCode?: string
  durationMs?: number
}

const AUTH_STATES: readonly TraceAuthState[] = ['login', 'mfa', 'authenticated', 'unknown']
const NAVIGATION_MODES: readonly NavigationMode[] = ['learn', 'replay', 'fallback', 'manual']
const ACTION_KINDS: readonly TraceActionKind[] = ['click', 'select_option', 'fill_date', 'scroll', 'wait', 'download', 'need_user']
const ELEMENT_TAGS: readonly TraceElementTag[] = ['a', 'button', 'input', 'select', 'textarea', 'summary', 'other']
const ELEMENT_TYPES: readonly TraceElementType[] = ['text', 'date', 'search', 'button', 'submit', 'checkbox', 'radio', 'number', 'other']
const PROVIDER_OPERATIONS: readonly ProviderOperation[] = ['create_browser', 'stop_browser', 'list_downloads', 'create_profile', 'delete_profile']
const OUTCOMES: readonly TraceOutcome[] = ['ok', 'error', 'blocked', 'fallback', 'timeout', 'cancelled', 'duplicate', 'ignored']
const FILE_KINDS: readonly TraceFileKind[] = ['csv', 'txt', 'xlsx', 'xls', 'pdf', 'other']
const SESSION_STATUSES: readonly BankImportStatusValue[] = [
  'QUEUED', 'STARTING', 'AWAITING_LOGIN', 'NAVIGATING', 'NEEDS_USER', 'CAPTURED', 'COMPLETE', 'FAILED', 'CANCELLED', 'EXPIRED',
]
const COMMAND_TYPES: readonly TraceCommand[] = ['LOGIN_DONE', 'TAKEOVER', 'RESUME_AGENT', 'CANCEL']
const ERROR_CODES = new Set([
  'unsupported_bank', 'worker_unavailable', 'worker_lost', 'provider_credits', 'provider_busy', 'internal', 'browser_stop',
  'session_cancelled', 'session_timeout', 'browser_start', 'browser_connect', 'download_failed', 'navigation_stuck',
  'guardrail_violation', 'artifact_too_large', 'invalid_playbook', 'postcondition_failed', 'element_missing', 'locator_missing',
  'option_mismatch', 'not_date_field', 'date_field_mismatch', 'date_fill_failed', 'date_not_accepted', 'bank_action_failed',
])

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T)
}

function safeCount(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
}

export function sanitizeTraceFields(input: unknown): TraceFields {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const source = input as Record<string, unknown>
  const output: TraceFields = {}
  if (typeof source.workerId === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(source.workerId)) output.workerId = source.workerId
  if (isOneOf(source.sessionStatus, SESSION_STATUSES)) output.sessionStatus = source.sessionStatus
  if (isOneOf(source.commandType, COMMAND_TYPES)) output.commandType = source.commandType
  if (safeCount(source.stepIndex, 1000)) output.stepIndex = source.stepIndex
  if (isOneOf(source.navigationMode, NAVIGATION_MODES)) output.navigationMode = source.navigationMode
  if (source.intent === 'other' || (typeof source.intent === 'string' && isOneOf(source.intent, [
    'open_selected_account', 'open_transaction_activity', 'open_export_options', 'select_csv', 'set_date_from', 'set_date_to', 'download_csv',
  ]))) output.intent = source.intent as TraceFields['intent']
  if (isOneOf(source.actionKind, ACTION_KINDS)) output.actionKind = source.actionKind
  if (safeCount(source.elementIndex, 249)) output.elementIndex = source.elementIndex
  if (isOneOf(source.targetTag, ELEMENT_TAGS)) output.targetTag = source.targetTag
  if (isOneOf(source.targetType, ELEMENT_TYPES)) output.targetType = source.targetType
  if (typeof source.targetDisabled === 'boolean') output.targetDisabled = source.targetDisabled
  if (isOneOf(source.authState, AUTH_STATES)) output.authState = source.authState
  if (isRouteClass(source.routeBefore)) output.routeBefore = source.routeBefore
  if (isRouteClass(source.routeAfter)) output.routeAfter = source.routeAfter
  if (safeCount(source.elementCount, 1000)) output.elementCount = source.elementCount
  if (safeCount(source.frameCount, 20)) output.frameCount = source.frameCount
  if (safeCount(source.snapshotFailureCount, 20)) output.snapshotFailureCount = source.snapshotFailureCount
  if (safeCount(source.retryCount, 1000)) output.retryCount = source.retryCount
  if (source.model === 'anthropic/claude-sonnet-4.6') output.model = source.model
  if (safeCount(source.inputTokens, 10_000_000)) output.inputTokens = source.inputTokens
  if (safeCount(source.outputTokens, 10_000_000)) output.outputTokens = source.outputTokens
  if (safeCount(source.toolRounds, 1000)) output.toolRounds = source.toolRounds
  if (isOneOf(source.providerOperation, PROVIDER_OPERATIONS)) output.providerOperation = source.providerOperation
  if (safeCount(source.providerStatus, 599) && source.providerStatus >= 100) output.providerStatus = source.providerStatus
  if (isOneOf(source.fileKind, FILE_KINDS)) output.fileKind = source.fileKind
  if (safeCount(source.fileSizeBytes, 5_000_000_000)) output.fileSizeBytes = source.fileSizeBytes
  if (isOneOf(source.outcome, OUTCOMES)) output.outcome = source.outcome
  if (typeof source.errorCode === 'string' && ERROR_CODES.has(source.errorCode)) output.errorCode = source.errorCode
  if (safeCount(source.durationMs, 86_400_000)) output.durationMs = source.durationMs
  return output
}

function isRouteClass(value: unknown): value is RouteClass {
  return value === 'login' || value === 'dashboard' || value === 'account' || value === 'activity' || value === 'export' || value === 'other'
}

export function classifyRoute(bankKey: string, url: string): RouteClass {
  let parsed: URL
  try { parsed = new URL(url) } catch { return 'other' }
  const host = parsed.hostname.toLowerCase()
  if (bankKey === 'chase' && host !== 'chase.com' && !host.endsWith('.chase.com')) return 'other'
  if (bankKey === 'n26' && host !== 'n26.com' && !host.endsWith('.n26.com')) return 'other'
  if (bankKey === 'fakebank' && host !== 'localhost' && host !== '127.0.0.1') return 'other'
  const route = `${parsed.pathname}/${parsed.hash}`.toLowerCase()
  if (/login|logon/.test(route)) return 'login'
  if (/export|download|statement|kontoauszug/.test(route)) return 'export'
  if (/activity|transaction|umsatz/.test(route)) return 'activity'
  if (/account|konto/.test(route)) return 'account'
  if (/dashboard|home|feed/.test(route)) return 'dashboard'
  return 'other'
}

export interface SafeTraceRecord extends TraceFields {
  traceId: string
  name: TraceName
  phase: TracePhase
  at: string
}

export function sanitizeTraceRecord(input: unknown): SafeTraceRecord | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const source = input as Record<string, unknown>
  if (typeof source.traceId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(source.traceId)) return null
  if (!isOneOf(source.name, TRACE_NAMES)) return null
  if (source.phase !== 'start' && source.phase !== 'end' && source.phase !== 'event') return null
  if (typeof source.at !== 'string' || !Number.isFinite(Date.parse(source.at))) return null
  return { traceId: source.traceId, name: source.name, phase: source.phase, at: source.at, ...sanitizeTraceFields(source) }
}
