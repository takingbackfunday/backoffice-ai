import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium, type Browser, type BrowserContext, type Frame, type Page } from 'playwright-core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBank } from '@/lib/bank-import/banks'
import { decideAuthState } from './auth-decide'
import { detectAuthState } from './auth-detect'

const chase = getBank('chase')!
const n26 = getBank('n26')!

describe('decideAuthState', () => {
  it('detects a password form as login', () => {
    expect(decideAuthState({ url: 'https://secure.chase.com/home', passwordVisible: true, logoutVisible: false, mfaText: '' }, chase)).toBe('login')
  })

  it('detects bank authentication from a known URL', () => {
    expect(decideAuthState({ url: 'https://app.n26.com/feed', passwordVisible: false, logoutVisible: false, mfaText: '' }, n26)).toBe('authenticated')
  })

  it.each(['/downloads', '/transactions/export', '/statements', '/kontoauszuege'])(
    'keeps N26 authenticated on its export route %s', (route) => {
      expect(decideAuthState({ url: `https://app.n26.com${route}`, passwordVisible: false, logoutVisible: false }, n26)).toBe('authenticated')
    },
  )

  it('does not trust unrelated routes or lookalike hosts as authenticated', () => {
    expect(decideAuthState({ url: 'https://app.n26.com/settings', passwordVisible: false, logoutVisible: false }, n26)).toBe('unknown')
    expect(decideAuthState({ url: 'https://app.n26.com.attacker.invalid/downloads', passwordVisible: false, logoutVisible: false }, n26)).toBe('unknown')
  })

  it('detects app-based multifactor approval', () => {
    expect(decideAuthState({ url: 'https://app.n26.com/confirm', passwordVisible: false, logoutVisible: false, mfaText: 'Approve in your N26 app' }, n26)).toBe('mfa')
  })

  it('uses visible sign-out as an authenticated signal and otherwise stays unknown', () => {
    expect(decideAuthState({ url: 'https://secure.chase.com/home', passwordVisible: false, logoutVisible: true, mfaText: '' }, chase)).toBe('authenticated')
    expect(decideAuthState({ url: 'https://secure.chase.com/home', passwordVisible: false, logoutVisible: false, mfaText: 'Welcome' }, chase)).toBe('unknown')
  })

  it('lets MFA override authenticated URLs and logout, including legacy text callers', () => {
    const signals = { url: 'https://app.n26.com/feed', passwordVisible: false, logoutVisible: true }
    expect(decideAuthState({ ...signals, mfaText: 'Enter the verification code' }, n26)).toBe('mfa')
    expect(decideAuthState({ ...signals, url: 'https://app.n26.com/downloads', mfaVisible: true }, n26)).toBe('mfa')
    expect(decideAuthState({ ...signals, mfaVisible: true }, n26)).toBe('mfa')
    expect(decideAuthState({ ...signals, mfaVisible: false, mfaText: 'Approve in your app' }, n26)).toBe('mfa')
  })

  it('keeps password and login URL evidence ahead of MFA', () => {
    const signals = { url: 'https://app.n26.com/feed', passwordVisible: true, logoutVisible: true, mfaVisible: true }
    expect(decideAuthState(signals, n26)).toBe('login')
    expect(decideAuthState({ ...signals, url: 'https://app.n26.com/login', passwordVisible: false }, n26)).toBe('login')
  })
})

describe('detectAuthState', () => {
  const frame = (signals = { password: false, logout: true, mfa: false }) => ({
    isDetached: vi.fn(() => false),
    evaluate: vi.fn().mockResolvedValue(signals),
  })
  const page = (frames: ReturnType<typeof frame>[]) => ({
    frames: () => frames,
    url: () => 'https://app.n26.com/feed',
  }) as unknown as Page

  it('checks every frame up to six, so later MFA overrides earlier logout evidence', async () => {
    const frames = Array.from({ length: 7 }, () => frame())
    frames[5].evaluate.mockResolvedValue({ password: false, logout: false, mfa: true })
    expect(await detectAuthState(page(frames), n26)).toBe('mfa')
    frames.slice(0, 6).forEach((candidate) => expect(candidate.evaluate).toHaveBeenCalledOnce())
    expect(frames[6].evaluate).not.toHaveBeenCalled()
  })

  it('reports unknown on any failed frame instead of trusting an authenticated shell', async () => {
    const failed = frame()
    failed.evaluate.mockRejectedValue(new Error('frame disappeared'))
    expect(await detectAuthState(page([frame(), failed]), n26)).toBe('unknown')
    expect(await detectAuthState(page([failed, frame({ password: false, logout: false, mfa: true })]), n26)).toBe('unknown')
  })

  it('reports unknown for detached frames or no frames', async () => {
    const detached = frame()
    detached.isDetached.mockReturnValue(true)
    expect(await detectAuthState(page([frame(), detached]), n26)).toBe('unknown')
    expect(detached.evaluate).not.toHaveBeenCalled()
    expect(await detectAuthState(page([]), n26)).toBe('unknown')
  })
})

const chromeAvailable = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/google/chrome/chrome'].some(existsSync)

describe.skipIf(!chromeAvailable)('detectAuthState with synthetic local Chrome', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page
  const bank = { ...n26, loginUrlPatterns: [/\/login$/], authenticatedUrlPatterns: [/\/shell$/] }

  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking'] })
  })
  beforeEach(async () => {
    context = await browser.newContext({ serviceWorkers: 'block' })
    await context.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: '<body></body>' }))
    page = await context.newPage()
    await page.goto('http://127.0.0.1/shell')
  })
  afterEach(async () => { await context?.close() })
  afterAll(async () => { await browser?.close() })

  it('detects login, authenticated and MFA states under the worker tsx runtime', async () => {
    const { stdout } = await promisify(execFile)(process.execPath, ['--require', 'tsx/cjs', '-e', `
      const { chromium } = require('playwright-core');
      const { detectAuthState } = require('./src/worker/auth-detect.ts');
      const { getBank } = require('./src/lib/bank-import/banks.ts');
      (async () => {
        const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking'] });
        try {
          const context = await browser.newContext({ serviceWorkers: 'block' });
          await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<body></body>' }));
          const page = await context.newPage();
          const bank = getBank('n26');
          await page.goto('https://app.n26.com/login');
          await page.setContent('<input type="password">');
          const login = await detectAuthState(page, bank);
          await page.goto('https://app.n26.com/feed');
          await page.setContent('<button>Log out</button>');
          const authenticated = await detectAuthState(page, bank);
          await page.setContent('<button>Log out</button><p>Enter the verification code</p>');
          const mfa = await detectAuthState(page, bank);
          console.log(JSON.stringify({ login, authenticated, mfa }));
        } finally { await browser.close(); }
      })().catch(() => { process.exitCode = 1; });
    `], { timeout: 15_000 })
    expect(JSON.parse(stdout)).toEqual({ login: 'login', authenticated: 'authenticated', mfa: 'mfa' })
  }, 20_000)

  it('finds MFA in nested open roots on non-interactive hosts and returns only booleans', async () => {
    await page.setContent('<button>Log out</button><div id="host"></div>')
    await page.evaluate(() => {
      const root = document.getElementById('host')!.attachShadow({ mode: 'open' })
      root.innerHTML = '<section></section>'
      root.querySelector('section')!.attachShadow({ mode: 'open' }).innerHTML =
        '<p>Enter the verification code</p><input aria-label="Verification code" value="123456">'
    })
    const evaluate = vi.spyOn(page.mainFrame(), 'evaluate')
    expect(await detectAuthState(page, bank)).toBe('mfa')
    expect(await evaluate.mock.results[0].value).toEqual({ password: false, logout: true, mfa: true })
    evaluate.mockRestore()
  })

  it('finds password and logout evidence inside open roots, but ignores hidden MFA', async () => {
    await page.goto('http://127.0.0.1/unknown')
    await page.setContent('<div id="host"></div><p hidden>Approve in your app</p>')
    await page.evaluate(() => {
      document.getElementById('host')!.attachShadow({ mode: 'open' }).innerHTML = '<button>Sign out</button>'
    })
    expect(await detectAuthState(page, bank)).toBe('authenticated')
    await page.evaluate(() => {
      document.getElementById('host')!.shadowRoot!.innerHTML += '<input type="password">'
    })
    expect(await detectAuthState(page, bank)).toBe('login')
  })

  it('finds MFA in the sixth frame even with an authenticated top-level shell', async () => {
    await page.setContent('<button>Log out</button>' + '<iframe srcdoc="<p>Welcome</p>"></iframe>'.repeat(5))
    const frames: Frame[] = page.frames()
    expect(frames).toHaveLength(6)
    await frames[5].evaluate(() => { document.body.innerHTML = '<p>Approve in your app</p>' })
    expect(await detectAuthState(page, bank)).toBe('mfa')
  })
})
