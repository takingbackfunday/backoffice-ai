import { prisma } from '@/lib/prisma'
import { __testHooks, runSession } from '@/worker/run-session'
import { parsePlaybook } from '@/lib/bank-import/playbook'

const USER_ID = 'e2e_bank_import'
const RUN_ID = `e2e-${Date.now()}`
const INSTITUTION_NAME = `Fake Bank ${RUN_ID}`
const ACCOUNT_NAME = `Checking ${RUN_ID}`

let institutionId: string | null = null
let accountId: string | null = null
const sessionIds: string[] = []

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function printEvents(id: string): Promise<void> {
  const events = await prisma.bankImportEvent.findMany({ where: { sessionId: id }, orderBy: { id: 'asc' } })
  console.log(JSON.stringify(events.map((event) => ({ id: event.id, type: event.type, message: event.message, data: event.data, createdAt: event.createdAt })), null, 2))
}

async function createSession(accountId: string, dateFrom: string, dateTo: string): Promise<string> {
  const session = await prisma.bankImportSession.create({
    data: {
      userId: USER_ID,
      accountId,
      bankKey: 'fakebank',
      dateFrom,
      dateTo,
      status: 'QUEUED',
      rememberBrowser: false,
      expiresAt: new Date(Date.now() + 20 * 60_000),
    },
    select: { id: true },
  })
  sessionIds.push(session.id)
  return session.id
}

async function runAndAssert(sessionId: string, expectReplay: boolean): Promise<void> {
  const running = runSession(sessionId, 'e2e')
  let lastStatus = ''
  while (true) {
    const current = await prisma.bankImportSession.findUnique({ where: { id: sessionId }, select: { status: true } })
    if (current?.status && current.status !== lastStatus) {
      lastStatus = current.status
      console.log(`bank-import-e2e status=${lastStatus}`)
    }
    const settled = await Promise.race([running.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500))])
    if (settled) break
  }

  const result = await prisma.bankImportSession.findUnique({
    where: { id: sessionId },
    include: { artifacts: { select: { id: true, mimeType: true, sizeBytes: true, content: true } } },
  })
  if (!result) throw new Error('E2E session disappeared before verification.')
  const csvArtifacts = result.artifacts.filter((artifact) => artifact.content && (artifact.mimeType === 'text/csv' || artifact.mimeType === 'text/plain'))
  const events = await prisma.bankImportEvent.findMany({ where: { sessionId }, orderBy: { id: 'asc' } })
  const serializedEvents = JSON.stringify(events)
  const traceData = events.filter((event) => event.type === 'trace').map((event) => event.data as Record<string, unknown>)
  const guardrailEvents = traceData.filter((data) => ['guardrail.block', 'guardrail.url_violation'].includes(String(data.name)))
  const warningEvents = events.filter((event) => event.type === 'warning')
  await printEvents(sessionId)

  if (result.status !== 'CAPTURED') throw new Error(`Expected CAPTURED, got ${result.status}.`)
  if (csvArtifacts.length !== 1) throw new Error(`Expected one captured CSV-like artifact, got ${csvArtifacts.length}.`)
  if (serializedEvents.includes('/transfer')) throw new Error('The event journal contains a transfer path.')
  if (guardrailEvents.length > 0 && warningEvents.length === 0) throw new Error('A blocked action did not create a warning event.')
  if (guardrailEvents.length === 0 && warningEvents.some((event) => /blocked/i.test(event.message))) {
    throw new Error('A guardrail warning was emitted without a blocked-action trace.')
  }
  if (!traceData.some((data) => data.name === 'session.terminal' && data.sessionStatus === 'CAPTURED')) {
    throw new Error('The session is missing its captured terminal trace event.')
  }
  if (!traceData.some((data) => data.name === 'artifact.save' && data.phase === 'end' && data.fileKind === 'csv')) {
    throw new Error('The CSV artifact save is missing from the trace.')
  }
  if (expectReplay && !traceData.some((data) => data.name === 'navigation.mode' && data.navigationMode === 'replay')) {
    throw new Error('The second session did not select the saved export flow.')
  }
  if (expectReplay && traceData.some((data) => data.name === 'navigation.fallback')) {
    throw new Error('The second session fell back instead of replaying the saved export flow.')
  }
  if (expectReplay && !traceData.some((data) => data.name === 'auth.complete' && data.phase === 'end' && data.outcome === 'ok')) {
    throw new Error('The second session did not complete its interactive sign-in.')
  }
}

async function main(): Promise<void> {
  if (process.env.BANK_IMPORT_FAKEBANK !== '1' || process.env.BANK_WORKER_LOCAL_BROWSER !== '1') {
    throw new Error('Set BANK_IMPORT_FAKEBANK=1 and BANK_WORKER_LOCAL_BROWSER=1 before running this E2E.')
  }

  const institution = await prisma.institutionSchema.create({
    data: {
      name: INSTITUTION_NAME,
      country: 'US',
      isGlobal: false,
      createdByUserId: USER_ID,
      csvMapping: {},
    },
    select: { id: true },
  })
  institutionId = institution.id

  const account = await prisma.account.create({
    data: { userId: USER_ID, institutionSchemaId: institution.id, name: ACCOUNT_NAME, type: 'CHECKING' },
    select: { id: true },
  })
  accountId = account.id

  const today = new Date()
  const dateTo = isoDay(today)
  const fromDate = new Date(today)
  fromDate.setUTCDate(fromDate.getUTCDate() - 10)
  const dateFrom = isoDay(fromDate)
  let humanSignInCount = 0
  __testHooks.onAwaitingLogin = async (page) => {
    humanSignInCount++
    await page.locator('input[name="user"]').fill('fake-user')
    await page.locator('input[type="password"]').fill('fake-password')
    await Promise.all([
      page.waitForURL('**/verify'),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ])
    await page.locator('input[name="code"]').fill('123456')
    await Promise.all([
      page.waitForURL('**/dashboard'),
      page.getByRole('button', { name: 'Verify' }).click(),
    ])
  }

  const firstSessionId = await createSession(account.id, dateFrom, dateTo)
  await runAndAssert(firstSessionId, false)
  const firstPlaybook = await prisma.bankImportPlaybook.findUnique({ where: { userId_bankKey: { userId: USER_ID, bankKey: 'fakebank' } } })
  if (!firstPlaybook || firstPlaybook.successCount !== 1) throw new Error('The first successful run did not save its export playbook.')
  const learnedSteps = firstPlaybook && parsePlaybook(firstPlaybook.version, firstPlaybook.steps)
  if (!learnedSteps || learnedSteps.at(-1)?.intent !== 'download_csv') throw new Error('The learned flow is missing its CSV download step.')
  if (learnedSteps.some((step, index) => index > 0 && learnedSteps[index - 1].intent === step.intent)) {
    throw new Error('The learned flow contains repeated adjacent navigation intents.')
  }

  const secondSessionId = await createSession(account.id, dateFrom, dateTo)
  await runAndAssert(secondSessionId, true)
  const secondPlaybook = await prisma.bankImportPlaybook.findUnique({ where: { userId_bankKey: { userId: USER_ID, bankKey: 'fakebank' } } })
  if (!secondPlaybook || secondPlaybook.successCount !== 2) throw new Error('The replayed run did not update playbook success tracking.')
  if (humanSignInCount !== 2) throw new Error(`Expected interactive sign-in twice, got ${humanSignInCount}.`)
}

main().catch(async (error) => {
  console.error('bank-import-e2e failed', error instanceof Error ? error.message : 'UnknownError')
  for (const id of sessionIds) await printEvents(id).catch(() => {})
  process.exitCode = 1
}).finally(async () => {
  __testHooks.onAwaitingLogin = undefined
  if (sessionIds.length) await prisma.bankImportSession.deleteMany({ where: { id: { in: sessionIds } } }).catch(() => {})
  await prisma.bankImportPlaybook.deleteMany({ where: { userId: USER_ID, bankKey: 'fakebank' } }).catch(() => {})
  if (accountId) await prisma.account.delete({ where: { id: accountId } }).catch(() => {})
  if (institutionId) await prisma.institutionSchema.delete({ where: { id: institutionId } }).catch(() => {})
  await prisma.$disconnect()
})
