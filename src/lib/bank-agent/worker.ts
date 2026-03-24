import { chromium, type Page, type BrowserContext, type CDPSession } from 'playwright-core'
import { openrouterChat } from '@/lib/llm/openrouter'
import type { PlaybookStep, PageElement, SyncJobEvent } from '@/types/bank-agent'

const NAV_MODEL = 'anthropic/claude-sonnet-4.6'
const MAX_NAV_STEPS = 20
const STEP_DELAY_MS = 1500
const TWO_FA_TIMEOUT_MS = 120_000

function getBrowserlessUrl(): string {
  const token = process.env.BROWSERLESS_TOKEN
  if (!token) throw new Error('BROWSERLESS_TOKEN env var is required')
  return `wss://production-sfo.browserless.io/chromium/stealth?token=${token}`
}

async function extractPageElements(page: Page): Promise<PageElement[]> {
  return page.evaluate(() => {
    const elements: PageElement[] = []
    const nodes = document.querySelectorAll(
      'input, button, a, select, [role="button"], [type="submit"]'
    )
    let index = 0

    for (const el of nodes) {
      const rect = el.getBoundingClientRect()
      const isVisible = rect.width > 0 && rect.height > 0 &&
        getComputedStyle(el).visibility !== 'hidden' &&
        getComputedStyle(el).display !== 'none'

      let selector = ''
      if (el.id) selector = `#${CSS.escape(el.id)}`
      else if (el.getAttribute('name')) selector = `[name="${el.getAttribute('name')}"]`
      else if (el.getAttribute('data-testid')) selector = `[data-testid="${el.getAttribute('data-testid')}"]`
      else if (el.getAttribute('aria-label')) selector = `[aria-label="${el.getAttribute('aria-label')}"]`
      else {
        const tag = el.tagName.toLowerCase()
        const text = (el.textContent || '').trim().slice(0, 30)
        if (text) selector = `${tag}:has-text("${text}")`
        else selector = `${tag}:nth-of-type(${index + 1})`
      }

      const text = (el as HTMLElement).innerText?.trim() ||
                   el.getAttribute('aria-label') ||
                   el.getAttribute('value') ||
                   el.getAttribute('title') || ''

      elements.push({
        index, tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') ?? undefined,
        text: text.slice(0, 100),
        placeholder: el.getAttribute('placeholder') ?? undefined,
        selector,
        href: el.getAttribute('href') ?? undefined,
        isVisible,
      })
      index++
    }
    return elements
  })
}

interface LLMAction {
  action: 'fill' | 'click' | 'wait' | 'done' | 'download' | 'scroll' | 'error'
  elementIndex?: number
  value?: string
  reason: string
}

async function askLLMForAction(
  pageUrl: string,
  pageTitle: string,
  elements: PageElement[],
  goal: string,
  history: string[],
): Promise<LLMAction> {
  const visibleElements = elements.filter(e => e.isVisible)
  const elementList = visibleElements.map(e => {
    let desc = `[${e.index}] <${e.tag}`
    if (e.type) desc += ` type="${e.type}"`
    desc += `>`
    if (e.text) desc += ` "${e.text}"`
    if (e.placeholder) desc += ` placeholder="${e.placeholder}"`
    if (e.href) desc += ` href="${e.href}"`
    return desc
  }).join('\n')

  const prompt = `You are a browser automation agent navigating a bank website.

CURRENT PAGE:
- URL: ${pageUrl}
- Title: ${pageTitle}

INTERACTIVE ELEMENTS ON PAGE:
${elementList || '(no interactive elements found)'}

ACTIONS TAKEN SO FAR:
${history.length > 0 ? history.map((h, i) => `${i + 1}. ${h}`).join('\n') : '(none)'}

GOAL: ${goal}

Respond with EXACTLY one JSON object (no markdown fences, no extra text):
{
  "action": "fill" | "click" | "wait" | "done" | "download" | "scroll" | "error",
  "elementIndex": <number from element list — required for fill/click/download>,
  "value": "<text to type — only for fill>",
  "reason": "<one sentence>"
}

Rules:
- "fill" = type into an input. Provide "value".
- "click" = click a button, link, or element.
- "download" = you found a CSV/export download button. Click it to trigger download.
- "wait" = page is loading or transitioning.
- "done" = goal accomplished.
- "error" = stuck or page doesn't match expectations.
- For login: fill username first, then password, then click submit.
- For export: look for "export", "download", "CSV", "transactions", "statements", "activity".`

  const response = await openrouterChat(
    [{ role: 'user', content: prompt }],
    NAV_MODEL
  )

  try {
    const clean = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    return JSON.parse(clean) as LLMAction
  } catch {
    console.error('[bank-agent] LLM parse fail:', response.slice(0, 200))
    return { action: 'error', reason: 'Failed to parse LLM response' }
  }
}

async function detect2FA(page: Page): Promise<boolean> {
  const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase())
  const keywords = [
    'verification code', 'two-factor', 'two factor', '2fa', 'authenticat',
    'one-time', 'otp', 'verify your identity', 'security code',
    'confirm your identity', 'enter the code', 'sent a code',
    'text message', 'sms code', 'approve the notification',
    'push notification', 'check your phone', 'check your device',
  ]
  return keywords.some(kw => bodyText.includes(kw))
}

async function detectOtpInput(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"], input:not([type])')
    for (const input of inputs) {
      const el = input as HTMLInputElement
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const hint = [
        el.placeholder, el.name, el.id, el.getAttribute('aria-label'),
        el.getAttribute('autocomplete'),
      ].join(' ').toLowerCase()
      if (hint.match(/code|otp|verify|token|one.?time|2fa|mfa|pin/)) return true
      if (el.maxLength >= 4 && el.maxLength <= 8) return true
    }
    return false
  })
}

async function handle2FA(
  page: Page,
  cdpSession: CDPSession,
  onEvent: (event: SyncJobEvent) => void
): Promise<void> {
  const hasOtpInput = await detectOtpInput(page)

  if (hasOtpInput) {
    try {
      const result = await cdpSession.send('Browserless.liveURL' as any)
      const liveURL = (result as any).liveURL
      onEvent({
        type: 'twofa_required',
        message: 'Your bank needs a verification code entered in the browser. Use the link below to enter it, then close that tab.',
        liveUrl: liveURL as string,
      })
    } catch {
      onEvent({
        type: 'twofa_required',
        message: 'Your bank requires entering a code in the browser. This needs a Browserless paid plan ($25/mo). Upgrade at browserless.io/pricing, or use manual CSV import for this bank.',
      })
      throw new Error('OTP input required but Browserless liveURL not available on current plan.')
    }
  } else {
    onEvent({
      type: 'twofa_required',
      message: 'Your bank sent a 2FA challenge. Check your phone or email and approve it — the agent will continue automatically.',
    })
  }

  const start = Date.now()
  while (Date.now() - start < TWO_FA_TIMEOUT_MS) {
    await page.waitForTimeout(2500)
    const still2FA = await detect2FA(page).catch(() => false)
    if (!still2FA) {
      onEvent({ type: 'status', message: '2FA completed. Continuing…' })
      await page.waitForTimeout(STEP_DELAY_MS)
      return
    }
  }
  throw new Error('2FA timed out after 2 minutes.')
}

async function captureDownload(page: Page, clickAction: () => Promise<void>): Promise<string> {
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
  await clickAction()
  const download = await downloadPromise

  const readable = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

export interface ConnectBankParams {
  loginUrl: string
  username: string
  password: string
  accountId: string
}

export interface WorkerResult {
  success: boolean
  csvText?: string
  discoveredSteps?: PlaybookStep[]
  exportPagePath?: string
  csvDownloadSelector?: string
  twoFaType?: string
  error?: string
}

export async function connectBank(
  params: ConnectBankParams,
  onEvent: (event: SyncJobEvent) => void
): Promise<WorkerResult> {
  let browser
  try {
    onEvent({ type: 'status', message: 'Launching cloud browser…' })
    browser = await chromium.connectOverCDP(getBrowserlessUrl())

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()
    const cdpSession = await context.newCDPSession(page)

    const recordedSteps: PlaybookStep[] = []
    const history: string[] = []
    let twoFaType = 'none'

    onEvent({ type: 'status', message: 'Opening bank website…' })
    await page.goto(params.loginUrl, { waitUntil: 'networkidle', timeout: 30_000 })
    recordedSteps.push({ action: 'goto', url: params.loginUrl, description: 'Navigate to login page' })
    history.push(`Navigated to ${params.loginUrl}`)

    onEvent({ type: 'status', message: 'Analyzing login page…' })

    let elements = await extractPageElements(page)
    let llmAction = await askLLMForAction(
      page.url(), await page.title(), elements,
      `Find the username/email input field and fill it with: ${params.username}`,
      history
    )
    if (llmAction.action === 'fill' && llmAction.elementIndex !== undefined) {
      const el = elements[llmAction.elementIndex]
      onEvent({ type: 'status', message: 'Entering username…' })
      await page.locator(el.selector).fill(params.username)
      recordedSteps.push({ action: 'fill', selector: el.selector, description: 'Enter username', isCredentialField: 'username' })
      history.push(`Filled username into ${el.selector}`)
      await page.waitForTimeout(STEP_DELAY_MS)
    }

    elements = await extractPageElements(page)
    llmAction = await askLLMForAction(
      page.url(), await page.title(), elements,
      'Find the password input field and fill it.',
      history
    )
    if (llmAction.action === 'fill' && llmAction.elementIndex !== undefined) {
      const el = elements[llmAction.elementIndex]
      onEvent({ type: 'status', message: 'Entering password…' })
      await page.locator(el.selector).fill(params.password)
      recordedSteps.push({ action: 'fill', selector: el.selector, description: 'Enter password', isCredentialField: 'password' })
      history.push(`Filled password into ${el.selector}`)
      await page.waitForTimeout(STEP_DELAY_MS)
    }

    elements = await extractPageElements(page)
    llmAction = await askLLMForAction(
      page.url(), await page.title(), elements,
      'Find and click the sign-in / login / submit button.',
      history
    )
    if (llmAction.action === 'click' && llmAction.elementIndex !== undefined) {
      const el = elements[llmAction.elementIndex]
      onEvent({ type: 'status', message: 'Logging in…' })
      await page.locator(el.selector).click()
      recordedSteps.push({ action: 'click', selector: el.selector, description: 'Click login button' })
      history.push(`Clicked login: ${el.selector}`)
      await page.waitForTimeout(3000)
    }

    const is2FA = await detect2FA(page)
    if (is2FA) {
      twoFaType = 'unknown'
      recordedSteps.push({ action: 'wait', waitMs: 0, description: 'Wait for user 2FA' })
      await handle2FA(page, cdpSession, onEvent)

      const text = await page.evaluate(() => document.body.innerText.toLowerCase()).catch(() => '')
      if (text.includes('sms') || text.includes('text message')) twoFaType = 'sms'
      else if (text.includes('authenticator') || text.includes('totp')) twoFaType = 'totp'
      else if (text.includes('push') || text.includes('approve')) twoFaType = 'push'
      else if (text.includes('email')) twoFaType = 'email'
    }

    onEvent({ type: 'status', message: 'Searching for transaction export…' })
    let csvText: string | null = null
    let exportPagePath: string | null = null
    let csvDownloadSelector: string | null = null

    for (let step = 0; step < MAX_NAV_STEPS; step++) {
      elements = await extractPageElements(page)
      llmAction = await askLLMForAction(
        page.url(), await page.title(), elements,
        'Find where to download/export transaction data as CSV. Look for "Download", "Export", "CSV", "Statements", "Activity", "Transaction history". Navigate menus if needed. Use "download" action when you find the export button.',
        history
      )

      console.log(`[bank-agent] nav step ${step + 1}:`, llmAction.action, llmAction.reason)

      if (llmAction.action === 'done') break
      if (llmAction.action === 'error') throw new Error(`Agent stuck: ${llmAction.reason}`)
      if (llmAction.action === 'wait') { await page.waitForTimeout(3000); history.push('Waited'); continue }
      if (llmAction.action === 'scroll') { await page.evaluate(() => window.scrollBy(0, 500)); history.push('Scrolled'); continue }
      if (llmAction.elementIndex === undefined) continue

      const el = elements[llmAction.elementIndex]

      if (llmAction.action === 'click') {
        await page.locator(el.selector).click()
        recordedSteps.push({ action: 'click', selector: el.selector, description: llmAction.reason })
        history.push(`Clicked: ${el.text || el.selector}`)
        await page.waitForTimeout(STEP_DELAY_MS)
      }

      if (llmAction.action === 'fill') {
        await page.locator(el.selector).fill(llmAction.value ?? '')
        recordedSteps.push({ action: 'fill', selector: el.selector, value: llmAction.value, description: llmAction.reason })
        history.push(`Filled "${llmAction.value}" into ${el.selector}`)
        await page.waitForTimeout(STEP_DELAY_MS)
      }

      if (llmAction.action === 'download') {
        onEvent({ type: 'status', message: 'Downloading CSV…' })
        exportPagePath = new URL(page.url()).pathname
        csvDownloadSelector = el.selector

        try {
          csvText = await captureDownload(page, () => page.locator(el.selector).click())
          recordedSteps.push({ action: 'download', selector: el.selector, description: 'Download CSV' })
          history.push(`Downloaded CSV via ${el.selector}`)
        } catch (dlErr) {
          console.error('[bank-agent] Download capture failed:', dlErr)
          const pages = context.pages()
          if (pages.length > 1) {
            const lastPage = pages[pages.length - 1]
            csvText = await lastPage.evaluate(() => document.body.innerText).catch(() => null)
            if (lastPage !== page) await lastPage.close()
          }
        }

        if (csvText) break
      }
    }

    if (!csvText) {
      throw new Error(`Could not download CSV after ${history.length} steps.`)
    }

    onEvent({ type: 'status', message: 'CSV downloaded!' })
    return { success: true, csvText, discoveredSteps: recordedSteps, exportPagePath: exportPagePath ?? undefined, csvDownloadSelector: csvDownloadSelector ?? undefined, twoFaType }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bank-agent] connectBank error:', msg)
    return { success: false, error: msg }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

export interface SyncBankParams {
  loginUrl: string
  username: string
  password: string
  steps: PlaybookStep[]
  csvDownloadSelector?: string
  exportPagePath?: string
}

export async function syncBank(
  params: SyncBankParams,
  onEvent: (event: SyncJobEvent) => void
): Promise<WorkerResult> {
  let browser
  try {
    onEvent({ type: 'status', message: 'Connecting to cloud browser…' })
    browser = await chromium.connectOverCDP(getBrowserlessUrl())

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()
    const cdpSession = await context.newCDPSession(page)
    let csvText: string | null = null

    for (let i = 0; i < params.steps.length; i++) {
      const step = params.steps[i]
      onEvent({ type: 'status', message: `Step ${i + 1}/${params.steps.length}: ${step.description}` })

      try {
        switch (step.action) {
          case 'goto':
            await page.goto(step.url!, { waitUntil: 'networkidle', timeout: 30_000 })
            break

          case 'fill': {
            const value = step.isCredentialField === 'username' ? params.username
                        : step.isCredentialField === 'password' ? params.password
                        : step.value ?? ''
            await page.locator(step.selector!).fill(value)
            break
          }

          case 'click':
            await page.locator(step.selector!).click()
            break

          case 'wait':
            if (step.waitMs && step.waitMs > 0) {
              await page.waitForTimeout(step.waitMs)
            } else {
              const is2FA = await detect2FA(page)
              if (is2FA) await handle2FA(page, cdpSession, onEvent)
            }
            break

          case 'download':
            onEvent({ type: 'status', message: 'Downloading transactions…' })
            csvText = await captureDownload(page, () => page.locator(step.selector!).click())
            break
        }

        await page.waitForTimeout(STEP_DELAY_MS)

      } catch (stepErr) {
        console.warn(`[bank-agent] Step ${i + 1} failed, falling back to LLM…`, stepErr)
        onEvent({ type: 'status', message: 'Step failed, using AI to recover…' })

        const elements = await extractPageElements(page)
        const llmAction = await askLLMForAction(
          page.url(), await page.title(), elements,
          `Step "${step.description}" failed (action: ${step.action}, selector: "${step.selector}"). Find the equivalent element on this page.`,
          [`Replaying saved playbook, step ${i + 1} of ${params.steps.length} failed`]
        )

        if (llmAction.action === 'error') {
          throw new Error(`Recovery failed at step ${i + 1}: ${llmAction.reason}`)
        }

        if (llmAction.elementIndex !== undefined) {
          const el = elements[llmAction.elementIndex]
          if (llmAction.action === 'click') await page.locator(el.selector).click()
          if (llmAction.action === 'fill') await page.locator(el.selector).fill(llmAction.value ?? '')
          if (llmAction.action === 'download') {
            csvText = await captureDownload(page, () => page.locator(el.selector).click())
          }
        }
        await page.waitForTimeout(STEP_DELAY_MS)
      }
    }

    if (!csvText) throw new Error('Playbook completed but no CSV was downloaded.')
    return { success: true, csvText }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bank-agent] syncBank error:', msg)
    return { success: false, error: msg }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}