import type { Page } from 'playwright-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectedPostcondition, type PlaybookIntent, type PlaybookStep } from '@/lib/bank-import/playbook'

const mocks = vi.hoisted(() => ({
  session: { findUnique: vi.fn(), update: vi.fn() },
  playbook: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  appendEvent: vi.fn(), appendTrace: vi.fn(), transition: vi.fn(), takeCommands: vi.fn(), saveArtifact: vi.fn(),
  openBrowser: vi.fn(), pollDownloads: vi.fn(), closeBrowser: vi.fn(),
  observer: { start: vi.fn(), stop: vi.fn(), dispose: vi.fn(), invalidate: vi.fn() }, createObserver: vi.fn(),
  snapshot: vi.fn(), detectAuth: vi.fn(), decide: vi.fn(), replay: vi.fn(), execute: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { bankImportSession: mocks.session, bankImportPlaybook: mocks.playbook } }))
vi.mock('@/lib/bank-import/sessions', () => ({
  appendEvent: mocks.appendEvent, appendTrace: mocks.appendTrace, heartbeat: vi.fn(), transition: mocks.transition,
  takeCommands: mocks.takeCommands, saveArtifact: mocks.saveArtifact, REVIEW_TTL_MS: 60_000,
}))
vi.mock('@/lib/bank-import/secret-box', () => ({ seal: () => 'sealed' }))
vi.mock('@/lib/agent/usage', () => ({ recordAgentUsage: vi.fn() }))
vi.mock('@/lib/log', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('./providers', () => ({ openBrowser: mocks.openBrowser, MAX_FILE_BYTES: 20 * 1024 * 1024 }))
vi.mock('./takeover-observer', () => ({ createTakeoverObserver: mocks.createObserver }))
vi.mock('./auth-detect', () => ({ detectAuthState: mocks.detectAuth }))
vi.mock('./page-elements', async importOriginal => ({ ...await importOriginal<typeof import('./page-elements')>(), snapshotPage: mocks.snapshot, isCsvSelected: () => true }))
vi.mock('./navigator', () => ({ decideNextAction: mocks.decide, resolvePlaybookStep: mocks.replay }))
vi.mock('./actions', () => ({ executeAction: mocks.execute }))
vi.mock('./session-context', async importOriginal => ({ ...await importOriginal<typeof import('./session-context')>(), sleep: async () => {} }))

import { runSession } from './run-session'

const step = (intent: PlaybookIntent): PlaybookStep => ({ intent, expected: expectedPostcondition(intent) })
const file = { name: 'synthetic.csv', bytes: Buffer.from('date,amount\n2026-09-03,12.50\n') }
const route = [step('open_selected_account'), { ...step('open_navigation_menu'), target: 'more' as const }, { ...step('open_export_options'), target: 'download_activity' as const }, step('select_csv'), { ...step('download_csv'), target: 'export' as const }]

describe('takeover learning session integration with mocked storage and provider', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.session.findUnique.mockResolvedValue({
      id: 'session', userId: 'owner', bankKey: 'chase', status: 'STARTING', expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(),
      dateFrom: '2026-09-01', dateTo: '2026-10-09', rememberBrowser: false,
      account: { name: 'Synthetic checking', bankAccountHint: '4321', institution: {} },
    })
    mocks.session.update.mockResolvedValue({})
    mocks.playbook.findUnique.mockResolvedValue(null)
    mocks.playbook.upsert.mockResolvedValue({})
    mocks.playbook.update.mockResolvedValue({})
    mocks.appendEvent.mockResolvedValue({})
    mocks.transition.mockResolvedValue({})
    mocks.takeCommands.mockResolvedValue([])
    mocks.takeCommands.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(['TAKEOVER'])
    mocks.saveArtifact.mockResolvedValue({ duplicate: false })
    mocks.detectAuth.mockResolvedValue('authenticated')
    const page = { goto: vi.fn(), url: () => 'https://secure.chase.com/accounts/activity', waitForTimeout: vi.fn() } as unknown as Page
    mocks.openBrowser.mockResolvedValue({ page, context: { on: vi.fn() }, liveUrl: null, browserId: 'browser', pollNewDownloads: mocks.pollDownloads, close: mocks.closeBrowser })
    mocks.pollDownloads.mockResolvedValue([]).mockResolvedValueOnce([]).mockResolvedValueOnce([file])
    mocks.createObserver.mockResolvedValue(mocks.observer)
    mocks.observer.start.mockResolvedValue(undefined)
    mocks.observer.dispose.mockResolvedValue(undefined)
    mocks.closeBrowser.mockResolvedValue(undefined)
    mocks.observer.stop.mockResolvedValue({ steps: route, valid: true, downloadObserved: true })
    mocks.snapshot.mockResolvedValue({ url: page.url(), elements: [], locate: () => null })
  })

  it('persists owner-scoped manual navigation and fresh date parameters only after a valid capture', async () => {
    await runSession('session', 'worker')
    expect(mocks.observer.start).toHaveBeenCalledOnce()
    expect(mocks.observer.stop).toHaveBeenCalledOnce()
    const saved = mocks.playbook.upsert.mock.calls[0][0]
    expect(saved.where).toEqual({ userId_bankKey: { userId: 'owner', bankKey: 'chase' } })
    expect(saved.create.steps.map((s: PlaybookStep) => s.intent)).toEqual(['open_selected_account', 'open_navigation_menu', 'open_export_options', 'select_csv', 'set_date_from', 'set_date_to', 'download_csv'])
    expect(JSON.stringify(saved.create.steps)).not.toMatch(/Synthetic|4321|2026|https|selector|label/)
    expect(mocks.appendEvent.mock.calls.some(call => call[2] === 'Your takeover export flow was remembered for your next visit.')).toBe(true)
    expect(mocks.transition.mock.calls.some(call => call[2] === 'CAPTURED')).toBe(true)
    expect(mocks.closeBrowser).toHaveBeenCalledOnce()
    expect(mocks.observer.dispose).toHaveBeenCalled()
  })

  it.each(['unsafe', 'suffix-only', 'unattributed', 'html', 'cancel'])('preserves capture/cleanup but does not train a %s route', async reason => {
    if (reason === 'unsafe') mocks.observer.stop.mockResolvedValue({ steps: route, valid: false, downloadObserved: true })
    if (reason === 'suffix-only') mocks.observer.stop.mockResolvedValue({ steps: [step('download_csv')], valid: true, downloadObserved: true })
    if (reason === 'unattributed') mocks.observer.stop.mockResolvedValue({ steps: route.slice(0, -1), valid: true, downloadObserved: true })
    if (reason === 'html') mocks.pollDownloads.mockReset().mockResolvedValue([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...file, bytes: Buffer.from('<html>Error,date\nPlease sign in,again</html>') }])
    if (reason === 'cancel') mocks.takeCommands.mockResolvedValueOnce(['CANCEL'])
    await runSession('session', 'worker')
    expect(mocks.playbook.upsert).not.toHaveBeenCalled()
    expect(mocks.closeBrowser).toHaveBeenCalledOnce()
    expect(mocks.observer.dispose).toHaveBeenCalled()
    if (reason !== 'cancel') expect(mocks.transition.mock.calls.some(call => call[2] === 'CAPTURED')).toBe(true)
  })

  it('does not lose a valid download when playbook persistence fails', async () => {
    mocks.playbook.upsert.mockRejectedValue(new Error('storage unavailable'))
    await runSession('session', 'worker')
    expect(mocks.transition.mock.calls.some(call => call[2] === 'CAPTURED')).toBe(true)
    expect(mocks.appendEvent.mock.calls.some(call => call[2] === 'The download is ready, but the export flow could not be remembered.')).toBe(true)
  })

  it('learns a manual middle segment and lets the agent finish with current session dates', async () => {
    mocks.takeCommands.mockReset().mockResolvedValue([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(['TAKEOVER']).mockResolvedValueOnce(['RESUME_AGENT'])
    mocks.observer.stop.mockResolvedValue({ steps: route.slice(0, -1), valid: true, downloadObserved: false })
    let count = 0
    mocks.pollDownloads.mockReset().mockImplementation(async () => ++count >= 7 ? [file] : [])
    const actions = [
      { action: 'fill_date', dateField: 'from', intent: 'set_date_from', reason: 'Set start date' },
      { action: 'fill_date', dateField: 'to', intent: 'set_date_to', reason: 'Set end date' },
      { action: 'download', intent: 'download_csv', reason: 'Download' },
    ]
    mocks.decide.mockImplementation(async () => ({ action: actions.shift() }))
    mocks.execute.mockImplementation(async ({ action }) => ({ ok: true, verifiedValue: action.dateField ? 'verified' : undefined, expectDownload: action.action === 'download', message: 'Done' }))
    await runSession('session', 'worker')
    expect(mocks.playbook.upsert).toHaveBeenCalledOnce()
    expect(mocks.playbook.upsert.mock.calls[0][0].create.steps.at(-1).intent).toBe('download_csv')
  })

  it('replays the remembered menu cue on the next session without arming the observer', async () => {
    const savedRoute = [route[1], route[2], step('set_date_from'), step('set_date_to'), step('download_csv')]
    mocks.playbook.findUnique.mockResolvedValue({ id: 'saved', version: 1, steps: savedRoute, consecutiveFailures: 0 })
    mocks.takeCommands.mockReset().mockResolvedValue([])
    let count = 0
    mocks.pollDownloads.mockReset().mockImplementation(async () => ++count >= 6 ? [file] : [])
    mocks.snapshot.mockResolvedValue({ url: 'https://secure.chase.com/accounts/export', elements: [{ role: 'menuitem', text: 'Download account activity' }], locate: () => null })
    mocks.replay.mockImplementation(async (_input, s) => ({ action: { intent: s.intent, action: s.intent.startsWith('set_date') ? 'fill_date' : s.intent === 'download_csv' ? 'download' : 'click', dateField: s.intent === 'set_date_from' ? 'from' : s.intent === 'set_date_to' ? 'to' : undefined, reason: 'Replay' } }))
    mocks.execute.mockImplementation(async ({ action }) => ({ ok: true, verifiedValue: action.dateField ? 'verified' : undefined, expectDownload: action.action === 'download', message: 'Done' }))
    await runSession('session', 'worker')
    expect(mocks.replay.mock.calls[0][1]).toEqual(route[1])
    expect(mocks.observer.start).not.toHaveBeenCalled()
    expect(mocks.playbook.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ successCount: { increment: 1 } }) }))
  })

  it('hands off immediately after unverified date entry instead of proposing an autonomous download', async () => {
    mocks.takeCommands.mockReset().mockResolvedValue([])
    mocks.decide.mockResolvedValue({ action: { action: 'fill_date', dateField: 'from', intent: 'set_date_from', reason: 'Set start date' } })
    mocks.execute.mockResolvedValue({ ok: false, message: 'The date did not commit.', errorCode: 'date_not_accepted' })
    mocks.observer.stop.mockResolvedValue({ steps: [], valid: false, downloadObserved: false })
    await runSession('session', 'worker')
    expect(mocks.transition.mock.calls.some(call => call[2] === 'NEEDS_USER' && call[3].needsUserReason === 'stuck')).toBe(true)
    expect(mocks.observer.start).toHaveBeenCalledOnce()
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.decide).toHaveBeenCalledOnce()
    expect(mocks.playbook.upsert).not.toHaveBeenCalled()
    expect(mocks.transition.mock.calls.some(call => call[2] === 'CAPTURED')).toBe(true)
    expect(mocks.closeBrowser).toHaveBeenCalledOnce()
  })

  it.each(['localized', 'ISO'])('keeps saved dates active through multiple clicks and verifies identity-mapped %s fields with ambiguous labels', async format => {
    const savedRoute = [step('open_export_options'), step('set_date_from'), step('set_date_to'), step('download_csv')]
    mocks.playbook.findUnique.mockResolvedValue({ id: 'saved', version: 1, steps: savedRoute, consecutiveFailures: 0 })
    mocks.takeCommands.mockReset().mockResolvedValue([])
    mocks.snapshot.mockResolvedValue({ url: 'https://secure.chase.com/accounts/export', elements: [
      { id: 0, frameId: 0, tag: 'input', type: 'text', text: 'Date', domId: 'range:start', placeholder: 'MM/DD/YYYY', value: format === 'ISO' ? '2026-09-01' : '09/01/2026' },
      { id: 1, frameId: 0, tag: 'input', type: 'text', text: 'Date', domId: 'range:end', placeholder: 'MM/DD/YYYY', value: format === 'ISO' ? '2026-10-09' : '10/09/2026' },
    ], locate: () => null })
    let downloadStarted = false
    mocks.pollDownloads.mockReset().mockImplementation(async () => downloadStarted ? [file] : [])
    let startClicks = 0
    mocks.replay.mockImplementation(async (_input, saved) => {
      if (saved.intent === 'set_date_from') {
        startClicks++
        return { action: { action: 'click', elementId: 2, dateField: 'from', dateInputId: startClicks === 6 ? 0 : undefined, intent: saved.intent, reason: 'Navigate calendar' } }
      }
      if (saved.intent === 'set_date_to') return { action: { action: 'click', elementId: 2, dateField: 'to', dateInputId: 1, intent: saved.intent, reason: 'Select end date' } }
      return { action: { action: saved.intent === 'download_csv' ? 'download' : 'click', intent: saved.intent, reason: 'Replay' } }
    })
    mocks.execute.mockImplementation(async ({ action }) => {
      downloadStarted = action.action === 'download'
      return { ok: true, verifiedValue: action.dateInputId === undefined ? undefined : 'verified', expectDownload: downloadStarted, message: 'Done' }
    })
    await runSession('session', 'worker')
    expect(startClicks).toBe(6)
    expect(mocks.decide).not.toHaveBeenCalled()
    expect(mocks.observer.start).not.toHaveBeenCalled()
    expect(mocks.playbook.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ successCount: { increment: 1 } }) }))
    expect(mocks.transition.mock.calls.some(call => call[2] === 'CAPTURED')).toBe(true)
    const intermediateTraces = mocks.appendTrace.mock.calls.filter(call => call[1] === 'navigation.step' && call[2] === 'end' && call[3]?.intent === 'set_date_from')
    expect(intermediateTraces).toHaveLength(6)
    expect(intermediateTraces.every(call => call[3].outcome === 'ok')).toBe(true)
  })

  it.each([undefined, 1])('hands off on failed calendar selection (completion input ID %s)', async dateInputId => {
    mocks.takeCommands.mockReset().mockResolvedValue([])
    mocks.decide.mockResolvedValue({ action: { action: 'click', elementId: 2, dateField: 'from', dateInputId, intent: 'set_date_from', reason: 'Choose start date' } })
    mocks.execute.mockResolvedValue({ ok: false, message: 'The calendar did not select the requested date.', errorCode: 'date_not_accepted' })
    mocks.observer.stop.mockResolvedValue({ steps: [], valid: false, downloadObserved: false })
    await runSession('session', 'worker')
    expect(mocks.transition.mock.calls.some(call => call[2] === 'NEEDS_USER' && call[3].needsUserReason === 'stuck')).toBe(true)
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.decide).toHaveBeenCalledOnce()
    expect(mocks.playbook.upsert).not.toHaveBeenCalled()
  })

  it.each(['download', 'click'])('blocks %s while either calendar is unfinished, even after the other date completes', async exportAction => {
    mocks.takeCommands.mockReset().mockResolvedValue([])
    mocks.pollDownloads.mockReset().mockImplementation(async () => mocks.observer.start.mock.calls.length ? [file] : [])
    mocks.observer.stop.mockResolvedValue({ steps: [], valid: false, downloadObserved: false })
    const actions = [
      { action: 'click', elementId: 1, dateField: 'from', intent: 'set_date_from', reason: 'Open start calendar' },
      { action: 'click', elementId: 3, dateInputId: 2, dateField: 'to', intent: 'set_date_to', reason: 'Select end date' },
      { action: exportAction, elementId: 4, intent: exportAction === 'download' ? 'download_csv' : 'other', reason: 'Download' },
    ]
    mocks.decide.mockImplementation(async () => ({ action: actions.shift() }))
    mocks.execute.mockImplementation(async ({ action }) => ({ ok: true, verifiedValue: action.dateInputId === undefined ? undefined : 'verified', message: 'Done' }))
    await runSession('session', 'worker')
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(mocks.execute.mock.calls.some(call => call[0].action.action === 'download')).toBe(false)
    expect(mocks.transition.mock.calls.some(call => call[2] === 'NEEDS_USER' && /unfinished/.test(call[4]))).toBe(true)
    expect(mocks.playbook.upsert).not.toHaveBeenCalled()
  })

  it('revalidates both dates before Download when selecting the end date reset the start date', async () => {
    mocks.takeCommands.mockReset().mockResolvedValue([])
    mocks.pollDownloads.mockReset().mockImplementation(async () => mocks.observer.start.mock.calls.length ? [file] : [])
    mocks.observer.stop.mockResolvedValue({ steps: [], valid: false, downloadObserved: false })
    mocks.snapshot.mockResolvedValue({ url: 'https://secure.chase.com/accounts/export', elements: [
      { tag: 'input', type: 'text', text: 'From date', value: '10/08/2026' },
      { tag: 'input', type: 'text', text: 'To date', value: '10/09/2026' },
    ], locate: () => null })
    const actions = [
      { action: 'click', elementId: 2, dateField: 'from', dateInputId: 0, intent: 'set_date_from', reason: 'Set start date' },
      { action: 'click', elementId: 2, dateField: 'to', dateInputId: 1, intent: 'set_date_to', reason: 'Set end date' },
      { action: 'download', elementId: 3, intent: 'download_csv', reason: 'Download' },
    ]
    mocks.decide.mockImplementation(async () => ({ action: actions.shift() }))
    mocks.execute.mockResolvedValue({ ok: true, verifiedValue: 'verified', message: 'Done' })
    await runSession('session', 'worker')
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(mocks.transition.mock.calls.some(call => call[2] === 'NEEDS_USER')).toBe(true)
    expect(mocks.playbook.upsert).not.toHaveBeenCalled()
  })

  it('allows verified manual calendar correction on Resume without requiring trainable observation', async () => {
    mocks.takeCommands.mockReset().mockResolvedValue([])
    let resumed = false
    mocks.takeCommands.mockImplementation(async () => {
      if (mocks.observer.start.mock.calls.length && !resumed) { resumed = true; return ['RESUME_AGENT'] }
      return []
    })
    mocks.observer.stop.mockResolvedValue({ steps: [], valid: false, downloadObserved: false })
    mocks.snapshot.mockResolvedValue({ url: 'https://secure.chase.com/accounts/export', elements: [
      { tag: 'input', type: 'text', text: 'From date', value: '09/01/2026' },
      { tag: 'input', type: 'text', text: 'To date', value: '10/09/2026' },
    ], locate: () => null })
    let downloadStarted = false
    mocks.pollDownloads.mockReset().mockImplementation(async () => downloadStarted ? [file] : [])
    const actions = [
      { action: 'click', elementId: 2, dateField: 'from', intent: 'set_date_from', reason: 'Open start calendar' },
      { action: 'need_user', intent: 'other', reason: 'Please select dates manually' },
      { action: 'download', elementId: 3, intent: 'download_csv', reason: 'Download' },
    ]
    mocks.decide.mockImplementation(async () => ({ action: actions.shift() }))
    mocks.execute.mockImplementation(async ({ action }) => {
      downloadStarted = action.action === 'download'
      return { ok: true, expectDownload: downloadStarted, message: 'Done' }
    })
    await runSession('session', 'worker')
    expect(mocks.observer.start).toHaveBeenCalledOnce()
    expect(mocks.execute.mock.calls.some(call => call[0].action.action === 'download')).toBe(true)
    expect(mocks.transition.mock.calls.some(call => call[2] === 'CAPTURED')).toBe(true)
    expect(mocks.playbook.upsert).not.toHaveBeenCalled()
  })
})
