import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { Page } from 'playwright-core'
import { recordAgentUsage } from '@/lib/agent/usage'
import { logger } from '@/lib/log'
import { BrowserUseError, createProfile } from '@/lib/bank-import/browser-use-client'
import { getBank, type BankConfig } from '@/lib/bank-import/banks'
import { isElementDenied, isHostAllowed, isLogoutElement, isPathDenied } from '@/lib/bank-import/guardrails'
import { mimeFromFilename } from '@/lib/bank-import/mime'
import { expectedPostcondition, parsePlaybook, type PlaybookPostcondition, type PlaybookStep } from '@/lib/bank-import/playbook'
import { seal } from '@/lib/bank-import/secret-box'
import {
  appendEvent, heartbeat, REVIEW_TTL_MS, saveArtifact, transition,
  type TraceFields, type TraceName, type TracePhase,
} from '@/lib/bank-import/sessions'
import { classifyRoute, type NavigationMode, type RouteClass, type TraceElementTag, type TraceElementType } from '@/lib/bank-import/trace'
import { TERMINAL_STATUSES, type BankImportStatusValue } from '@/lib/bank-import/status'
import { decideNextAction, resolvePlaybookStep, type AgentAction, type NavigatorInput } from './navigator'
import { detectAuthState, type AuthState } from './auth-detect'
import { snapshotPage, type PageSnapshot } from './page-elements'
import { executeAction } from './actions'
import { SessionCancelled, SessionContext, SessionFailed, SessionTimedOut, sleep } from './session-context'
import { MAX_FILE_BYTES, openBrowser, type ProvidedBrowser } from './providers'

const LOGIN_TIMEOUT_MS = 5 * 60_000
const NEEDS_USER_TIMEOUT_MS = 5 * 60_000
const MAX_AGENT_STEPS = 25
const POLL_MS = 2000
const DOWNLOAD_WAIT_MS = 30_000
const LOGOUT_BUDGET_MS = 20_000
const MODEL = 'anthropic/claude-sonnet-4.6'

export const __testHooks: { onAwaitingLogin?: (page: Page) => Promise<void> } = {}

type FinalError = { status: BankImportStatusValue; code: string; message: string; outcome: 'error' | 'cancelled' | 'timeout' }

export async function runSession(sessionId: string, workerId: string): Promise<void> {
  let ctx: SessionContext | null = null
  let browser: ProvidedBrowser | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  const startedAt = Date.now()

  try {
    const session = await prisma.bankImportSession.findUnique({
      where: { id: sessionId },
      include: { account: { include: { institution: true } } },
    })
    if (!session) return
    const bank = getBank(session.bankKey)
    ctx = new SessionContext(session.id, session.userId, workerId, session.status, session.expiresAt.getTime())
    await ctx.trace('session.claimed', 'event', {
      sessionStatus: session.status,
      durationMs: Math.max(0, Date.now() - session.createdAt.getTime()),
      outcome: 'ok',
    })
    if (!bank) throw new SessionFailed('unsupported_bank', 'This bank is not supported.')
    if (ctx.status === 'QUEUED') {
      await transition(session.id, 'QUEUED', 'STARTING')
      ctx.status = 'STARTING'
    }
    heartbeatTimer = setInterval(() => { void heartbeat(session.id, workerId).catch(() => {}) }, 10_000)

    const trace = (name: TraceName, phase: TracePhase, fields: TraceFields = {}) => ctx!.trace(name, phase, fields)
    const localBrowser = process.env.BANK_WORKER_LOCAL_BROWSER === '1'
    const profileId = session.rememberBrowser && !localBrowser
      ? await ensureProfile(session.userId, bank, sessionId, trace)
      : null

    browser = await openBrowser({
      bank,
      sessionId,
      profileId,
      record: !localBrowser && recordAllowed(session.userId),
      timeoutMinutes: 25,
      trace,
    })
    await prisma.bankImportSession.update({
      where: { id: sessionId },
      data: {
        browserId: browser.browserId,
        browserRegion: bank.region,
        liveUrlEnc: browser.liveUrl ? seal(browser.liveUrl) : null,
      },
    })

    let page = browser.page
    browser.context.on('page', (nextPage) => {
      void (async () => {
        await nextPage.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {})
        const url = nextPage.url()
        if (url === 'about:blank' || isHostAllowed(url, bank.allowedHostSuffixes, bank.allowInsecureLocalhost)) {
          page = nextPage
          return
        }
        await nextPage.close().catch(() => {})
        await ctx?.trace('guardrail.url_violation', 'event', { outcome: 'blocked', errorCode: 'guardrail_violation' })
        await ctx?.emit('warning', 'A navigation outside the bank was blocked.')
      })()
    })

    const loginStart = Date.now()
    await ctx.trace('auth.complete', 'start', {})
    try {
      await page.goto(bank.loginUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await ctx.setStatus('AWAITING_LOGIN', `Waiting for you to sign in to ${bank.displayName}`, { needsUserReason: 'login' })
      if (process.env.BANK_IMPORT_FAKEBANK === '1' && process.env.NODE_ENV !== 'production') {
        await __testHooks.onAwaitingLogin?.(page)
      }
      await waitForLogin(ctx, page, bank, loginStart)
      await ctx.trace('auth.complete', 'end', { outcome: 'ok', durationMs: Date.now() - loginStart, authState: 'authenticated' })
    } catch (error) {
      await ctx.trace('auth.complete', 'end', {
        outcome: error instanceof SessionTimedOut ? 'timeout' : error instanceof SessionCancelled ? 'cancelled' : 'error',
        errorCode: error instanceof SessionTimedOut ? 'session_timeout' : error instanceof SessionCancelled ? 'session_cancelled' : 'internal',
        durationMs: Date.now() - loginStart,
      })
      throw error
    }
    await ctx.emit('status', 'Signed in. Starting the transaction export.', { status: 'NAVIGATING' })
    await ctx.setStatus('NAVIGATING', 'Finding your transactions…', { needsUserReason: null })

    const candidate: PlaybookStep[] = []
    const addCandidateStep = (candidateStep: PlaybookStep) => {
      if (candidate[candidate.length - 1]?.intent !== candidateStep.intent) candidate.push(candidateStep)
    }
    let savedSteps: PlaybookStep[] = []
    let playbookIndex = 0
    let replayActive = false
    let replayFailedThisSession = false
    let playbookChanged = false
    let manualDownload = false
    let navigationMode: NavigationMode = 'learn'
    const accountHint = session.account.bankAccountHint ?? undefined
    const history: string[] = []
    const notes: string[] = []
    let violations = 0
    let blocked = 0
    let parseFails = 0
    let stepsTaken = 0
    let csvCaptured = false

    const storedPlaybook = await prisma.bankImportPlaybook.findUnique({ where: { userId_bankKey: { userId: session.userId, bankKey: session.bankKey } } })
    const parsedPlaybook = storedPlaybook ? parsePlaybook(storedPlaybook.version, storedPlaybook.steps) : null
    if (parsedPlaybook && storedPlaybook && storedPlaybook.consecutiveFailures < 3) {
      savedSteps = parsedPlaybook
      replayActive = true
      navigationMode = 'replay'
      await ctx.trace('navigation.mode', 'event', { navigationMode, outcome: 'ok' })
      await ctx.emit('action', 'Using your saved export flow.')
    } else {
      playbookChanged = true
      navigationMode = storedPlaybook ? 'fallback' : 'learn'
      await ctx.trace('navigation.mode', 'event', { navigationMode, outcome: storedPlaybook ? 'fallback' : 'ok' })
      await ctx.emit('action', storedPlaybook ? 'Refreshing your saved export flow.' : "Learning this bank's export flow.")
    }

    const collectDownloads = async (): Promise<void> => {
      const pollStart = Date.now()
      await ctx!.trace('download.poll', 'start', {})
      const files = await browser!.pollNewDownloads()
      await ctx!.trace('download.poll', 'end', { outcome: 'ok', elementCount: files.length, durationMs: Date.now() - pollStart })
      for (const file of files) {
        if (ctx!.status === 'NEEDS_USER') manualDownload = true
        if (file.bytes.byteLength > MAX_FILE_BYTES) {
          await ctx!.trace('artifact.save', 'event', {
            fileKind: fileKindFromName(file.name), fileSizeBytes: file.bytes.byteLength, outcome: 'ignored', errorCode: 'artifact_too_large',
          })
          continue
        }
        const mimeType = mimeFromFilename(file.name)
        const fileKind = fileKindFromName(file.name)
        const artifactStart = Date.now()
        await ctx!.trace('artifact.save', 'start', { fileKind, fileSizeBytes: file.bytes.byteLength })
        const saved = await saveArtifact(sessionId, { filename: file.name, mimeType, bytes: file.bytes })
        await ctx!.trace('artifact.save', 'end', {
          fileKind, fileSizeBytes: file.bytes.byteLength, outcome: saved.duplicate ? 'duplicate' : 'ok', durationMs: Date.now() - artifactStart,
        })
        await ctx!.emit('artifact', `Downloaded ${fileKind.toUpperCase()} file (${Math.ceil(file.bytes.byteLength / 1024)} KB).`, {
          fileKind, fileSizeBytes: file.bytes.byteLength, duplicate: saved.duplicate,
        })
        if (isCsvLike(mimeType, file.bytes)) {
          csvCaptured = true
        } else {
          notes.push(`A ${fileKind.toUpperCase()} file was downloaded; we still need a CSV.`)
        }
      }
    }

    const navigatorInput = async (snapshot: PageSnapshot): Promise<NavigatorInput> => ({
      bank,
      accountName: session.account.name,
      accountHint,
      from: session.dateFrom,
      to: session.dateTo,
      snapshot,
      history,
      notes,
    })

    const runLlm = async (snapshot: PageSnapshot, savedStep?: PlaybookStep) => {
      const modelStart = Date.now()
      await ctx!.trace('llm.call', 'start', { model: MODEL, navigationMode, stepIndex: stepsTaken })
      let result: Awaited<ReturnType<typeof decideNextAction>>
      try {
        result = savedStep
          ? await resolvePlaybookStep(await navigatorInput(snapshot), savedStep)
          : await decideNextAction(await navigatorInput(snapshot))
      } catch (error) {
        await ctx!.trace('llm.call', 'end', {
          model: MODEL,
          navigationMode,
          stepIndex: stepsTaken,
          outcome: 'error',
          errorCode: error instanceof SessionTimedOut ? 'session_timeout' : 'internal',
          durationMs: Date.now() - modelStart,
        })
        throw error
      }
      const durationMs = Date.now() - modelStart
      const fields: TraceFields = {
        model: MODEL,
        navigationMode,
        stepIndex: stepsTaken,
        intent: result.action?.intent,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        toolRounds: 1,
        durationMs,
        outcome: result.action ? 'ok' : 'fallback',
      }
      await ctx!.trace('llm.call', 'end', fields)
      if (result.usage) {
        await recordAgentUsage({
          userId: session.userId,
          endpoint: 'bank-import',
          model: MODEL,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          toolRounds: 1,
          durationMs,
        })
      }
      return result
    }

    const failReplay = async () => {
      replayActive = false
      navigationMode = 'fallback'
      playbookChanged = true
      if (!replayFailedThisSession && storedPlaybook) {
        replayFailedThisSession = true
        await prisma.bankImportPlaybook.update({
          where: { id: storedPlaybook.id },
          data: { consecutiveFailures: { increment: 1 } },
        })
      }
      await ctx!.trace('navigation.fallback', 'event', { navigationMode, outcome: 'fallback', errorCode: 'postcondition_failed' })
      await ctx!.emit('warning', 'The saved export route changed. The assistant is finding the new route.')
    }

    while (!csvCaptured) {
      ctx.checkDeadline()
      await ctx.pollCommands()
      await collectDownloads()
      if (csvCaptured) break

      if (ctx.take('TAKEOVER')) {
        await needsUser('takeover', 'You can take over the bank browser.', ctx, page, bank, collectDownloads, () => csvCaptured)
        continue
      }
      const auth = await detectAuthState(page, bank)
      if (auth === 'login' || auth === 'mfa') {
        await needsUser('mfa', `${bank.displayName} wants you to sign in or confirm again.`, ctx, page, bank, collectDownloads, () => csvCaptured)
        continue
      }
      if (stepsTaken >= MAX_AGENT_STEPS) {
        await needsUser('stuck', 'The assistant ran out of navigation steps.', ctx, page, bank, collectDownloads, () => csvCaptured)
        stepsTaken = 0
        continue
      }

      const snapshot = await snapshotPage(page)
      const routeBefore = classifyRoute(bank.key, page.url())
      let action: AgentAction
      let activeSavedStep: PlaybookStep | undefined
      if (replayActive && playbookIndex < savedSteps.length) {
        activeSavedStep = savedSteps[playbookIndex]
        const result = await runLlm(snapshot, activeSavedStep)
        if (!result.action) {
          await failReplay()
          activeSavedStep = undefined
          const fallback = await runLlm(snapshot)
          action = fallback.action!
        } else {
          action = result.action
        }
      } else {
        if (replayActive) {
          await failReplay()
        }
        const result = await runLlm(snapshot)
        action = result.action!
      }
      stepsTaken++

      if (action.action === 'wait' && action.reason === 'Thinking…') {
        parseFails++
        if (parseFails >= 3) {
          await needsUser('stuck', 'The assistant could not read the bank page. Please download the CSV yourself.', ctx, page, bank, collectDownloads, () => csvCaptured)
          continue
        }
      } else {
        parseFails = 0
      }
      if (action.action === 'need_user') {
        await needsUser('stuck', action.reason, ctx, page, bank, collectDownloads, () => csvCaptured)
        continue
      }

      const navStart = Date.now()
      const targetElement = snapshot.elements.find((element) => element.id === action.elementId)
      await ctx.trace('navigation.step', 'start', {
        navigationMode,
        stepIndex: stepsTaken,
        intent: action.intent,
        actionKind: action.action,
        elementIndex: targetElement?.id,
        targetTag: traceElementTag(targetElement?.tag),
        targetType: traceElementType(targetElement?.type),
        targetDisabled: targetElement?.disabled,
        routeBefore,
        elementCount: snapshot.elements.length,
        frameCount: snapshot.frameCount,
        snapshotFailureCount: snapshot.snapshotFailureCount,
      })
      const result = await executeAction({ page, snap: snapshot, action, bank, from: session.dateFrom, to: session.dateTo })
      history.push(`${action.action}: ${result.message}`)
      if (result.blocked) {
        blocked++
        await ctx.trace('guardrail.block', 'event', { navigationMode, stepIndex: stepsTaken, actionKind: action.action, outcome: 'blocked', errorCode: 'guardrail_violation' })
        await ctx.emit('warning', 'A restricted bank action was blocked.')
        if (blocked >= 4) {
          await needsUser('stuck', 'The assistant encountered repeated safety blocks.', ctx, page, bank, collectDownloads, () => csvCaptured)
          continue
        }
      } else if (result.ok) {
        await ctx.emit('action', action.reason.slice(0, 160))
      }

      if (!isHostAllowed(page.url(), bank.allowedHostSuffixes, bank.allowInsecureLocalhost) || isPathDenied(page.url())) {
        violations++
        await ctx.trace('guardrail.url_violation', 'event', { navigationMode, stepIndex: stepsTaken, outcome: 'blocked', errorCode: 'guardrail_violation' })
        await ctx.emit('warning', 'A navigation outside the bank was blocked.')
        await page.goBack({ timeout: 10_000 }).catch(() => {})
        if (!isHostAllowed(page.url(), bank.allowedHostSuffixes, bank.allowInsecureLocalhost) || isPathDenied(page.url())) {
          await page.goto(bank.loginUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {})
        }
        if (violations >= 2) {
          await needsUser('stuck', 'The assistant left the allowed bank area more than once.', ctx, page, bank, collectDownloads, () => csvCaptured)
          continue
        }
      }

      if (result.expectDownload) {
        const waitStart = Date.now()
        while (!csvCaptured && Date.now() - waitStart < DOWNLOAD_WAIT_MS) {
          await collectDownloads()
          if (!csvCaptured) await sleep(POLL_MS)
        }
      }

      const routeAfter = classifyRoute(bank.key, page.url())
      let postconditionOk = false
      const expected = action.intent === 'other' ? null : expectedPostcondition(action.intent)
      const afterSnapshot = await snapshotPage(page)
      if (expected) postconditionOk = await verifyPostcondition(afterSnapshot, action, result.verifiedValue, expected, bank, csvCaptured)
      await ctx.trace('navigation.step', 'end', {
        navigationMode,
        stepIndex: stepsTaken,
        intent: action.intent,
        actionKind: action.action,
        routeBefore,
        routeAfter,
        outcome: result.blocked ? 'blocked' : result.ok && postconditionOk ? 'ok' : 'error',
        errorCode: result.errorCode,
        durationMs: Date.now() - navStart,
      })

      if (activeSavedStep) {
        if (result.ok && postconditionOk && expected === activeSavedStep.expected) {
          addCandidateStep(activeSavedStep)
          playbookIndex++
          if (playbookIndex >= savedSteps.length && !csvCaptured) await failReplay()
        } else if (replayActive) {
          await failReplay()
        }
      } else if (result.ok && expected && postconditionOk && action.intent !== 'other') {
        addCandidateStep({ intent: action.intent, expected })
      }
      if (csvCaptured) break
    }

    if (csvCaptured && !manualDownload) {
      const completeCandidate = candidate.length > 0 && candidate[candidate.length - 1].intent === 'download_csv'
      if (playbookChanged && completeCandidate) {
        await prisma.bankImportPlaybook.upsert({
          where: { userId_bankKey: { userId: session.userId, bankKey: session.bankKey } },
          create: {
            userId: session.userId,
            bankKey: session.bankKey,
            version: 1,
            steps: candidate as unknown as object[],
            successCount: 1,
            consecutiveFailures: 0,
            lastSuccessAt: new Date(),
          },
          update: {
            version: 1,
            steps: candidate as unknown as object[],
            successCount: { increment: 1 },
            consecutiveFailures: 0,
            lastSuccessAt: new Date(),
          },
        })
      } else if (storedPlaybook && !playbookChanged) {
        await prisma.bankImportPlaybook.update({
          where: { id: storedPlaybook.id },
          data: { successCount: { increment: 1 }, consecutiveFailures: 0, lastSuccessAt: new Date() },
        })
      }
    }

    await Promise.race([signOut(page, bank, ctx), sleep(LOGOUT_BUDGET_MS)])
    await ctx.setStatus('CAPTURED', 'Download complete. Ready to review.', {
      capturedAt: new Date(),
      expiresAt: new Date(Date.now() + REVIEW_TTL_MS),
      needsUserReason: null,
    })
    await ctx.trace('session.terminal', 'event', { sessionStatus: 'CAPTURED', outcome: 'ok', durationMs: Date.now() - startedAt })
  } catch (error) {
    const final = mapError(error)
    if (ctx) {
      await ctx.trace('session.terminal', 'event', {
        sessionStatus: final.status, outcome: final.outcome, errorCode: final.code, durationMs: Date.now() - startedAt,
      })
      await ctx.emit('error', final.message, { errorCode: final.code })
      logger.error('bank-worker', 'session failed', {
        traceId: sessionId,
        workerId,
        errorCode: final.code,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      })
      if (!TERMINAL_STATUSES.has(ctx.status) && ctx.status !== 'CAPTURED') {
        await transition(sessionId, ctx.status, final.status, { errorCode: final.code, errorMessage: final.message }, final.message).catch(() => {})
      }
    }
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    if (browser) {
      try { await browser.close() } catch {
        await ctx?.trace('browser.stop', 'event', { providerOperation: 'stop_browser', outcome: 'error', errorCode: 'browser_stop' })
      }
    }
    await prisma.bankImportSession.update({ where: { id: sessionId }, data: { liveUrlEnc: null } }).catch(() => {})
  }
}

async function ensureProfile(
  userId: string,
  bank: BankConfig,
  sessionId: string,
  trace: (name: TraceName, phase: TracePhase, fields?: TraceFields) => Promise<void>,
): Promise<string | null> {
  const startedAt = Date.now()
  await trace('browser.profile', 'start', { providerOperation: 'create_profile' })
  let profile: Awaited<ReturnType<typeof prisma.bankBrowserProfile.findUnique>> = null
  try {
    profile = await prisma.bankBrowserProfile.findUnique({ where: { userId_bankKey_region: { userId, bankKey: bank.key, region: bank.region } } })
    if (!profile) {
      const created = await createProfile(bank.region, {
        name: `backoffice-${bank.key}`,
        userId: createHash('sha256').update(userId).digest('hex').slice(0, 24),
      })
      profile = await prisma.bankBrowserProfile.create({ data: { userId, bankKey: bank.key, region: bank.region, profileId: created.id } })
    }
    await prisma.bankBrowserProfile.update({ where: { id: profile.id }, data: { lastUsedAt: new Date() } })
    await trace('browser.profile', 'end', { providerOperation: 'create_profile', outcome: 'ok', durationMs: Date.now() - startedAt })
    return profile.profileId
  } catch (error) {
    if (error instanceof BrowserUseError && error.status === 402) {
      await trace('browser.profile', 'end', {
        providerOperation: 'create_profile', providerStatus: 402, outcome: 'ignored', durationMs: Date.now() - startedAt,
      })
      await appendEvent(sessionId, 'warning', "Couldn't remember this browser; continuing without it.")
      return null
    }
    await trace('browser.profile', 'end', {
      providerOperation: 'create_profile',
      providerStatus: error instanceof BrowserUseError ? error.status : undefined,
      outcome: 'error', errorCode: 'browser_start', durationMs: Date.now() - startedAt,
    })
    throw error
  }
}

async function waitForLogin(ctx: SessionContext, page: import('playwright-core').Page, bank: BankConfig, startedAt: number): Promise<void> {
  let lastState: AuthState | null = null
  let authenticatedPolls = 0
  while (true) {
    ctx.checkDeadline()
    await ctx.pollCommands()
    if (ctx.take('LOGIN_DONE')) return
    if (Date.now() - startedAt > LOGIN_TIMEOUT_MS) throw new SessionTimedOut('Sign-in timed out.')
    const state = await detectAuthState(page, bank)
    if (state !== lastState) {
      await ctx.trace('auth.poll', 'event', { authState: state, routeAfter: classifyRoute(bank.key, page.url()), outcome: 'ok' })
      lastState = state
    }
    if (state === 'mfa') {
      await ctx.setStatus('AWAITING_LOGIN', `Confirm the sign-in in your ${bank.displayName} app or browser.`, { needsUserReason: 'mfa' })
    }
    authenticatedPolls = state === 'authenticated' ? authenticatedPolls + 1 : 0
    if (authenticatedPolls >= 2) return
    await sleep(POLL_MS)
  }
}

async function needsUser(
  reason: 'mfa' | 'takeover' | 'stuck',
  message: string,
  ctx: SessionContext,
  page: import('playwright-core').Page,
  bank: BankConfig,
  collectDownloads: () => Promise<void>,
  isCsvCaptured: () => boolean,
): Promise<void> {
  const startedAt = Date.now()
  await ctx.trace('navigation.fallback', 'start', { navigationMode: reason === 'mfa' ? 'manual' : 'fallback', outcome: 'fallback' })
  let outcome: TraceFields['outcome'] = 'ok'
  try {
    await ctx.setStatus('NEEDS_USER', message, { needsUserReason: reason })
    let authenticatedPolls = 0
    while (Date.now() - startedAt < NEEDS_USER_TIMEOUT_MS) {
      ctx.checkDeadline()
      await ctx.pollCommands()
      await collectDownloads()
      if (isCsvCaptured()) return
      if (ctx.take('RESUME_AGENT')) break
      const state = reason === 'mfa' ? await detectAuthState(page, bank) : 'unknown'
      authenticatedPolls = state === 'authenticated' ? authenticatedPolls + 1 : 0
      if (authenticatedPolls >= 2) break
      await sleep(POLL_MS)
    }
    if (Date.now() - startedAt >= NEEDS_USER_TIMEOUT_MS) {
      outcome = 'timeout'
      throw new SessionTimedOut('Waiting for your help timed out.')
    }
    await ctx.setStatus('NAVIGATING', 'Assistant resumed.', { needsUserReason: null })
  } catch (error) {
    if (error instanceof SessionTimedOut) outcome = 'timeout'
    else outcome = 'error'
    throw error
  } finally {
    await ctx.trace('navigation.fallback', 'end', { navigationMode: 'fallback', outcome, durationMs: Date.now() - startedAt })
  }
}

async function verifyPostcondition(
  snapshot: PageSnapshot,
  action: AgentAction,
  verifiedValue: string | undefined,
  expected: PlaybookPostcondition,
  bank: BankConfig,
  csvCaptured: boolean,
): Promise<boolean> {
  const route: RouteClass = classifyRoute(bank.key, snapshot.url)
  if (expected === 'account_selected') return route === 'account' || route === 'activity'
  if (expected === 'activity_visible') return route === 'activity'
  if (expected === 'export_options_visible') {
    return route === 'export' || snapshot.elements.some((element) => /csv|download|export|date range|datum|von|bis/i.test(`${element.text} ${element.ariaLabel ?? ''}`))
  }
  if (expected === 'csv_selected') {
    return snapshot.elements.some((element) => element.tag === 'select' && /csv|spreadsheet|excel/i.test(element.value ?? ''))
  }
  if (expected === 'from_date_set' || expected === 'to_date_set') {
    if (action.action !== 'fill_date' || !action.dateField || !verifiedValue) return false
    return action.dateField === (expected === 'from_date_set' ? 'from' : 'to')
  }
  return csvCaptured
}

async function signOut(page: import('playwright-core').Page, bank: BankConfig, ctx: SessionContext): Promise<void> {
  const startedAt = Date.now()
  await ctx.trace('browser.logout', 'start', {})
  try {
    if (!isHostAllowed(page.url(), bank.allowedHostSuffixes, bank.allowInsecureLocalhost) || isPathDenied(page.url())) {
      await ctx.trace('browser.logout', 'end', { outcome: 'ignored', durationMs: Date.now() - startedAt })
      return
    }
    const snapshot = await snapshotPage(page)
    let target = snapshot.elements.find((element) => isLogoutElement(element) && !isElementDenied(element, 'logout').denied)
    if (!target) {
      target = snapshot.elements.find((element) =>
        !element.href && (element.tag === 'button' || element.role === 'button') &&
        /^(profile|menu|account|konto)$/i.test(`${element.text} ${element.ariaLabel ?? ''}`.trim()),
      )
      if (target) {
        const menu = snapshot.locate(target.id)
        await menu?.click({ timeout: 3000 })
      }
      if (!isHostAllowed(page.url(), bank.allowedHostSuffixes, bank.allowInsecureLocalhost) || isPathDenied(page.url())) {
        await ctx.trace('browser.logout', 'end', { outcome: 'blocked', errorCode: 'guardrail_violation', durationMs: Date.now() - startedAt })
        return
      }
      const afterMenu = await snapshotPage(page)
      target = afterMenu.elements.find((element) => isLogoutElement(element) && !isElementDenied(element, 'logout').denied)
      const locator = target && afterMenu.locate(target.id)
      if (locator) await locator.click({ timeout: 3000 })
    } else {
      const locator = snapshot.locate(target.id)
      if (locator) await locator.click({ timeout: 3000 })
    }
    await page.waitForTimeout(2000)
    await ctx.trace('browser.logout', 'end', { outcome: 'ok', durationMs: Date.now() - startedAt })
  } catch {
    await ctx.trace('browser.logout', 'end', { outcome: 'error', durationMs: Date.now() - startedAt })
  }
}

function isCsvLike(mimeType: string, bytes: Buffer): boolean {
  if (mimeType === 'text/csv' || mimeType === 'text/plain') return true
  const sample = bytes.subarray(0, 2048).toString('utf8')
  const lines = sample.split(/\r?\n/).filter(Boolean)
  return lines.length >= 2 && lines.reduce((sum, line) => sum + (line.match(/[,;]/g)?.length ?? 0), 0) / lines.length >= 2
}

function fileKindFromName(name: string): NonNullable<TraceFields['fileKind']> {
  const mime = mimeFromFilename(name)
  if (mime === 'text/csv') return 'csv'
  if (mime === 'text/plain') return 'txt'
  if (mime.includes('spreadsheetml')) return 'xlsx'
  if (mime === 'application/vnd.ms-excel') return 'xls'
  if (mime === 'application/pdf') return 'pdf'
  return 'other'
}

function recordAllowed(userId: string): boolean {
  return (process.env.BANK_IMPORT_RECORD_USER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean).includes(userId)
}

function traceElementTag(tag: string | undefined): TraceElementTag | undefined {
  if (!tag) return undefined
  return ['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(tag) ? tag as TraceElementTag : 'other'
}

function traceElementType(type: string | undefined): TraceElementType | undefined {
  if (!type) return undefined
  return ['text', 'date', 'search', 'button', 'submit', 'checkbox', 'radio', 'number'].includes(type)
    ? type as TraceElementType
    : 'other'
}

function mapError(error: unknown): FinalError {
  if (error instanceof SessionCancelled) return { status: 'CANCELLED', code: 'session_cancelled', message: 'Import cancelled.', outcome: 'cancelled' }
  if (error instanceof SessionTimedOut) return { status: 'EXPIRED', code: 'session_timeout', message: 'This import session timed out. You can try again.', outcome: 'timeout' }
  if (error instanceof SessionFailed) return { status: 'FAILED', code: error.code, message: error.message, outcome: 'error' }
  if (error instanceof BrowserUseError && error.status === 402) return { status: 'FAILED', code: 'provider_credits', message: 'The browser service is out of credits. Please contact support.', outcome: 'error' }
  if (error instanceof BrowserUseError && error.status === 429) return { status: 'FAILED', code: 'provider_busy', message: 'The browser service is busy. Try again in a minute.', outcome: 'error' }
  return { status: 'FAILED', code: 'internal', message: 'Something went wrong while fetching from your bank.', outcome: 'error' }
}
