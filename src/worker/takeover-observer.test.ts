import { existsSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBank } from '@/lib/bank-import/banks'
import { createTakeoverObserver, type TakeoverObserver } from './takeover-observer'

const origin = 'https://secure.chase.com'
const dashboard = `${origin}/web/auth/dashboard#/dashboard`
const signedIn = '<button>Sign out</button>'
const dates = '<label>From date <input id="from" placeholder="MM/DD/YYYY" value="09/01/2026"></label><label>To date <input id="to" placeholder="MM/DD/YYYY" value="10/09/2026"></label>'
const csv = '<label><input type="radio" name="format" id="csv">CSV</label>'
const download = '<a download href="/fixture.csv">Download</a>'
const form = `${signedIn}${dates}${csv}${download}`

const chromeAvailable = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/google/chrome/chrome'].some(existsSync)

describe.skipIf(!chromeAvailable)('takeover observer with trusted synthetic Chrome interactions', () => {
  let browser: Browser, context: BrowserContext, page: Page, observer: TakeoverObserver | undefined
  const documents = new Map<string, string>()
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking'] })
  })
  beforeEach(async () => {
    documents.clear()
    context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true })
    await context.route('**/*', route => {
      const path = new URL(route.request().url()).pathname
      return path === '/fixture.csv'
        ? route.fulfill({ contentType: 'text/csv', headers: { 'content-disposition': 'attachment; filename="fixture.csv"' }, body: 'date,amount\n2026-09-01,1\n' })
        : route.fulfill({ contentType: 'text/html', body: documents.get(path) ?? signedIn })
    })
    page = await context.newPage()
    await page.goto(dashboard)
  })
  afterEach(async () => { await observer?.dispose(); observer = undefined; await context.close() })
  afterAll(async () => { await browser.close() })
  const create = async () => {
    observer = await createTakeoverObserver({ context, bank: getBank('chase')!, from: '2026-09-01', to: '2026-10-09', accountName: 'Synthetic private checking', accountHint: '4321' })
    return observer
  }
  const settle = (target = page) => target.waitForTimeout(240)
  const click = async (name: string, target = page) => { await target.getByText(name, { exact: true }).click(); await settle(target) }
  const capture = async (name = 'Download', target = page) => {
    await Promise.all([target.waitForEvent('download'), target.getByText(name, { exact: true }).click()])
    return observer!.stop()
  }
  const bindingCall = (payload: unknown, target = page) => target.evaluate(async payload => {
    const name = Object.getOwnPropertyNames(window).find(name => name.startsWith('__takeover_') && name.endsWith('_signal'))!
    await (window as unknown as Record<string, (payload: unknown) => Promise<void>>)[name]({ at: Date.now(), accountMatched: false, exportReady: false, ...(payload as object) })
  }, payload)

  it('is disabled until start and ignores untrusted DOM events, input, and keyboard events', async () => {
    await page.setContent(`${form}<button>Unknown action</button>`)
    await create()
    await click('Unknown action')
    await observer!.start(page)
    await page.getByText('Unknown action', { exact: true }).dispatchEvent('click')
    await page.evaluate(() => document.getElementById('from')!.dispatchEvent(new Event('input', { bubbles: true })))
    await page.keyboard.press('Shift')
    await click('CSV')
    const result = await capture()
    expect(result).toEqual({ steps: [{ intent: 'select_csv', expected: 'csv_selected' }, { intent: 'download_csv', expected: 'csv_downloaded', target: 'export' }], valid: true, downloadObserved: true })
  })

  it('learns the real menu/account/export/custom-date/CSV/download sequence without private content', async () => {
    await page.setContent(`${signedIn}<button onclick="document.getElementById('account').hidden=false">Synthetic private checking (4321)</button>
      <section id="account" hidden><h1>Synthetic private checking (4321)</h1>
      <button onclick="document.getElementById('menu').hidden=false;this.setAttribute('aria-expanded','true')">Menu</button>
      <nav role="menu" id="menu" hidden><button onclick="document.getElementById('more').hidden=false">More</button></nav>
      <div id="more" hidden><button onclick="document.getElementById('services').hidden=false">Account services</button></div>
      <div id="services" hidden><button onclick="document.getElementById('statements').hidden=false">Statements and documents</button></div>
      <div id="statements" hidden><button onclick="document.getElementById('options').hidden=false">Download account activity</button></div>
      <div id="options" hidden>${csv}<button onclick="document.getElementById('range').hidden=false">Custom range</button></div>
      <div id="range" hidden><label>From date <input id="from" placeholder="MM/DD/YYYY"></label><label>To date <input id="to" placeholder="MM/DD/YYYY"></label>${download}</div></section>`)
    await create(); await observer!.start(page)
    await page.getByRole('button', { name: 'Synthetic private checking (4321)', exact: true }).click(); await settle()
    await click('Menu'); await click('More'); await click('Account services')
    await click('Statements and documents'); await click('Download account activity'); await click('Custom range')
    await page.locator('#from').fill('09/01/2026'); await page.locator('#to').click(); await settle()
    await page.locator('#to').fill('10/09/2026'); await click('CSV')
    const result = await capture()
    expect(result.valid).toBe(true)
    expect(result.steps.map(step => [step.intent, step.target])).toEqual([
      ['open_selected_account', undefined], ['open_navigation_menu', 'menu'], ['open_navigation_menu', 'more'],
      ['open_navigation_menu', 'account_services'], ['open_export_options', 'statements_documents'],
      ['open_export_options', 'download_activity'], ['choose_date_range', 'custom_range'],
      ['set_date_from', undefined], ['set_date_to', undefined], ['select_csv', undefined], ['download_csv', 'export'],
    ])
    expect(JSON.stringify(result)).not.toMatch(/4321|Synthetic|09\/01|10\/09|chase|https|fixture/)
  })

  it('normalizes native associated labels and composed paths through nested open shadows', async () => {
    await page.setContent(`${signedIn}<div id="host"></div>`)
    await page.evaluate(({ dates, download }) => {
      const root = document.getElementById('host')!.attachShadow({ mode: 'open' })
      root.innerHTML = '<section></section>'
      root.querySelector('section')!.attachShadow({ mode: 'open' }).innerHTML = `${dates}<input id="csv" type="radio" style="position:absolute;left:-10000px"><label for="csv"><span>CSV</span></label>${download}`
    }, { dates, download })
    await create(); await observer!.start(page)
    await click('CSV')
    expect(await page.locator('#csv').isChecked()).toBe(true)
    expect((await capture()).valid).toBe(true)
  })

  it('uses explicit German date labels/formats and freshly verifies committed values', async () => {
    await page.setContent(`${signedIn}<label>Von <input id="from" placeholder="TT.MM.JJJJ"></label><span id="end">Bis</span><input id="to" aria-labelledby="end" placeholder="TT.MM.JJJJ">${csv}${download}`)
    await create(); await observer!.start(page)
    await page.locator('#from').fill('01.09.2026'); await page.locator('#to').click(); await settle()
    await page.locator('#to').fill('09.10.2026'); await click('CSV')
    const result = await capture()
    expect(result.valid).toBe(true)
    expect(result.steps.map(step => step.intent)).toEqual(['set_date_from', 'set_date_to', 'select_csv', 'download_csv'])
  })

  it('never infers unseen intermediate transitions, deduplicates only adjacent identical targets, and resets segments', async () => {
    await page.setContent(`${form}<nav role="menu"><button>Menu</button><button>More</button></nav>`)
    await create(); await observer!.start(page)
    await click('Menu'); await click('Menu'); await click('More'); await click('Menu')
    const partial = await observer!.stop()
    expect(partial.valid).toBe(true); expect(partial.downloadObserved).toBe(false)
    expect(partial.steps.map(step => step.target)).toEqual(['menu', 'more', 'menu'])
    await observer!.start(page)
    await click('CSV')
    const result = await capture()
    expect(result.valid).toBe(true)
    expect(result.steps.map(step => step.intent)).toEqual(['select_csv', 'download_csv'])
    await click('Menu')
    expect(await observer!.stop()).toEqual(result)
  })

  it('installs in existing/new frames, navigations and popups, all with locally mocked requests', async () => {
    documents.set('/existing', '<nav role="menu"><button>More</button></nav>')
    documents.set('/new', '<nav role="menu"><button>Account services</button></nav>')
    documents.set('/activity', `${form}<button onclick="window.open('/popup')">Ignored synthetic popup trigger</button>`)
    documents.set('/popup', form)
    await page.setContent(`${signedIn}<button onclick="location.href='/activity'">Transactions</button><iframe src="/existing"></iframe>`)
    await page.frameLocator('iframe').getByText('More').waitFor()
    await create(); await observer!.start(page)
    await page.frameLocator('iframe').getByText('More').click(); await settle()
    await page.evaluate(() => { const frame = document.createElement('iframe'); frame.src = '/new'; document.body.append(frame) })
    await page.frameLocator('iframe').nth(1).getByText('Account services').waitFor(); await settle()
    await page.frameLocator('iframe').nth(1).getByText('Account services').click(); await settle()
    await click('Transactions')
    const popupEvent = context.waitForEvent('page')
    await page.evaluate(() => { window.open('/popup') })
    const popup = await popupEvent
    await popup.waitForLoadState(); await settle(popup)
    await click('CSV', popup)
    const result = await capture('Download', popup)
    expect(result.valid).toBe(true)
    expect(result.steps.map(step => step.intent)).toEqual(['open_navigation_menu', 'open_navigation_menu', 'open_transaction_activity', 'select_csv', 'download_csv'])
  })

  it.each(['login', 'mfa', 'credential-label'])('never arms an unsafe %s page or returns secrets', async kind => {
    await page.setContent(kind === 'mfa' ? `${form}<p>Enter your verification code</p>` : kind === 'login' ? `${form}<input type="password" value="synthetic-password">` : `${form}<input aria-label="Username" value="synthetic-user-secret">`)
    await create(); await observer!.start(page)
    await click('CSV')
    expect(await observer!.stop()).toEqual({ steps: [], valid: false, downloadObserved: false })
  })

  it('rejects login navigation during a segment and leaves manual use intact', async () => {
    documents.set('/logon', '<input type="password"><input aria-label="Verification code"><button>Continue</button>')
    await page.setContent(form); await create(); await observer!.start(page)
    await page.goto(`${origin}/logon`); await settle()
    await page.locator('input[type="password"]').fill('synthetic-password')
    await page.getByLabel('Verification code').fill('synthetic-code')
    await click('Continue')
    const result = await observer!.stop()
    expect(result.valid).toBe(false); expect(result.steps).toEqual([])
    expect(JSON.stringify(result)).not.toMatch(/synthetic|password|code|logon/)
  })

  it.each(['https://foreign.invalid/frame', `${origin}/payments`, `${origin}/logon`])('rejects unapproved source frames (%#)', async url => {
    await page.setContent(form); await create(); await observer!.start(page)
    await page.evaluate(url => { const frame = document.createElement('iframe'); frame.src = url; document.body.append(frame) }, url)
    await page.frameLocator('iframe').getByText('Sign out').waitFor(); await settle()
    expect((await observer!.stop()).valid).toBe(false)
  })

  it.each(['unknown', 'generic-change', 'wrong-date', 'csv-unselected', 'ambiguous-date', 'missing-evidence', 'dropped-controls'])('invalidates %s without interfering with the download', async reason => {
    await page.setContent(`${form}<button>Unknown action</button><input id="generic" aria-label="Notes" value="synthetic-private-note">`)
    if (reason === 'ambiguous-date') await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<label>Start date <input type="date" value="2026-09-01"></label>'))
    if (reason === 'dropped-controls') await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<button>Menu</button>'.repeat(260)))
    await create(); await observer!.start(page)
    if (reason === 'unknown') await click('Unknown action')
    if (reason === 'generic-change') { await page.locator('#generic').fill('synthetic-changed-note'); await page.locator('#from').click(); await settle() }
    if (reason === 'wrong-date') { await page.locator('#from').fill('09/02/2026'); await page.locator('#to').click(); await settle() }
    if (reason === 'missing-evidence') { await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<button>Custom range</button>')); await page.locator('#from').evaluate(el => el.remove()); await click('Custom range') }
    if (reason !== 'csv-unselected') await click('CSV')
    const result = await capture()
    expect(result.valid).toBe(false)
    if (!['ambiguous-date', 'dropped-controls'].includes(reason)) expect(result.downloadObserved).toBe(true)
    expect(result.steps.some(step => step.intent === 'download_csv')).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/synthetic|Notes|Unknown|09\/02/)
  })

  it('accepts unequivocal Download CSV only with fresh requested dates, without inventing select_csv', async () => {
    await page.setContent(`${signedIn}${dates}<a download href="/fixture.csv">Download CSV</a>`)
    await create(); await observer!.start(page)
    expect(await capture('Download CSV')).toEqual({ steps: [{ intent: 'download_csv', expected: 'csv_downloaded', target: 'export' }], valid: true, downloadObserved: true })
  })

  it('observes trusted native select changes, not keyboard events or generic select values', async () => {
    await page.setContent(`${signedIn}<label>Date range <select id="range" size="2" onchange="document.getElementById('dates').hidden=false"><option>Recent transactions</option><option>Custom range</option></select></label>
      <div id="dates" hidden>${dates}</div><label>File type <select id="format" size="2"><option>PDF</option><option>CSV</option></select></label>${download}`)
    await create(); await observer!.start(page)
    await page.getByRole('option', { name: 'Custom range', exact: true }).click(); await settle()
    await page.getByRole('option', { name: 'CSV', exact: true }).click(); await settle()
    const result = await capture()
    expect(result.valid).toBe(true)
    expect(result.steps.map(step => step.intent)).toEqual(['choose_date_range', 'select_csv', 'download_csv'])
  })

  it.each(['password', 'mfa'])('rechecks fresh %s evidence even after a safe start', async kind => {
    await page.setContent(form); await create(); await observer!.start(page)
    await page.evaluate(kind => document.body.insertAdjacentHTML('beforeend', kind === 'password' ? '<input type="password" value="synthetic-password">' : '<p>Confirm your identity</p>'), kind)
    await click('CSV')
    const result = await capture()
    expect(result.valid).toBe(false); expect(result.steps).toEqual([]); expect(result.downloadObserved).toBe(true)
  })

  it('does not read generic input values, and rejects conflicting labels and date formats', async () => {
    await page.setContent(`${form}<input id="generic" value="synthetic-private-value"><button aria-label="Menu">Export</button>`)
    await page.evaluate(() => {
      const input = document.getElementById('generic') as HTMLInputElement
      Object.defineProperty(input, 'value', { get() { throw new Error('generic_value_must_not_be_read') } })
    })
    await create(); await observer!.start(page)
    await click('CSV')
    expect((await capture()).valid).toBe(true)
    await observer!.start(page); await page.getByRole('button', { name: 'Menu', exact: true }).click()
    expect((await observer!.stop()).steps).toEqual([])
    await page.locator('#from').evaluate(el => el.setAttribute('aria-label', 'From date DD/MM/YYYY'))
    await observer!.start(page)
    const result = await capture()
    expect(result.valid).toBe(false)
    expect(result.steps).toEqual([])
  })

  it('rejects stale date evidence at Download and requires a real download event', async () => {
    await page.setContent(form); await create(); await observer!.start(page); await click('CSV')
    await page.locator('#from').evaluate(el => { (el as HTMLInputElement).value = '09/02/2026' })
    expect((await capture()).valid).toBe(false)
    documents.set('/fresh', form.replace(download, '<button>Download</button>'))
    await page.goto(`${origin}/fresh`)
    await observer!.start(page); await click('CSV'); await page.getByText('Download', { exact: true }).click()
    const result = await observer!.stop()
    expect(result.valid).toBe(false); expect(result.downloadObserved).toBe(false)
    expect(result.steps.map(step => step.intent)).toEqual(['select_csv'])
  }, 10_000)

  it('bounds verification when a frame evaluation stalls and prevents late work from contaminating a new segment', async () => {
    await page.setContent(`${form}<nav role="menu"><button>Menu</button></nav>`)
    await create(); await observer!.start(page)
    const evaluation = vi.spyOn(page.mainFrame(), 'evaluate').mockImplementationOnce(() => new Promise(() => {}))
    await page.getByText('Menu', { exact: true }).click()
    await page.waitForTimeout(110)
    const started = Date.now()
    const result = await observer!.stop()
    expect(result.valid).toBe(false); expect(Date.now() - started).toBeLessThan(4000)
    evaluation.mockRestore()
    await observer!.start(page); await click('CSV')
    expect((await capture()).valid).toBe(true)
  })

  it('treats binding shape, semantic enums, target intent pairs, and queue overflow as untrusted', async () => {
    await page.setContent(`${form}<nav role="menu"><button>Menu</button></nav>`)
    await create()
    let segment = 0
    for (const extra of [{ rawLabel: 'synthetic-private-label' }, { intent: 'invented' }, { target: 'export' }, { before: -1 }, { directCsv: 'yes' }]) {
      await observer!.start(page)
      await bindingCall({ segment: ++segment, intent: 'open_navigation_menu', target: 'menu', directCsv: false, ...extra })
      const rejected = await observer!.stop()
      expect(rejected.valid).toBe(false); expect(rejected.steps).toEqual([])
    }
    await observer!.start(page)
    await page.evaluate(async () => {
      const name = Object.getOwnPropertyNames(window).find(name => name.startsWith('__takeover_') && name.endsWith('_signal'))!
      await Promise.all(Array.from({ length: 51 }, () => (window as unknown as Record<string, (payload: unknown) => Promise<void>>)[name]({ segment: 6, intent: 'open_navigation_menu', target: 'menu', directCsv: false, at: Date.now(), accountMatched: false, exportReady: false })))
    })
    expect((await observer!.stop()).steps).toEqual([])
  })

  it('invalidates explicitly, drains queued work at stop, and ignores late callbacks after disposal', async () => {
    await page.setContent(`${form}<nav role="menu"><button>Menu</button></nav>`)
    await create(); await observer!.start(page)
    await page.getByText('Menu', { exact: true }).click()
    expect((await observer!.stop()).steps).toEqual([{ intent: 'open_navigation_menu', expected: 'navigation_menu_visible', target: 'menu' }])
    await observer!.start(page); observer!.invalidate()
    await click('CSV'); expect((await capture()).valid).toBe(false)
    await observer!.start(page)
    await page.getByText('Menu', { exact: true }).click()
    await observer!.dispose()
    await click('CSV'); await bindingCall({ private: 'synthetic-late-secret' })
    await page.goto(dashboard); await settle()
    expect(await page.evaluate(() => Object.getOwnPropertyNames(window).filter(name => name.startsWith('__takeover_') && !name.endsWith('_signal')).length)).toBe(0)
    expect(await observer!.stop()).toEqual({ steps: [], valid: false, downloadObserved: false })
    await observer!.start(page)
    expect((await observer!.stop()).steps).toEqual([])
  })

  it('removes its listeners immediately when disposed during a pending final download', async () => {
    await page.setContent(form.replace(download, '<button>Download</button>'))
    const emitter = page as unknown as { listenerCount(event: string): number }
    const counts = ['download', 'framenavigated', 'close'].map(event => emitter.listenerCount(event))
    await create(); await observer!.start(page); await click('CSV')
    await page.getByText('Download', { exact: true }).click(); await page.waitForTimeout(110)
    await observer!.dispose()
    expect(['download', 'framenavigated', 'close'].map(event => emitter.listenerCount(event))).toEqual(counts)
    expect(await observer!.stop()).toEqual({ steps: [], valid: false, downloadObserved: false })
  })

  it('returns a safe empty or navigation-only segment as valid, independently of CSV completion', async () => {
    await page.setContent(`${form}<nav role="menu"><button>Menu</button></nav>`)
    await create(); await observer!.start(page)
    expect(await observer!.stop()).toEqual({ steps: [], valid: true, downloadObserved: false })
    await observer!.start(page); await page.getByText('Menu', { exact: true }).click()
    expect(await observer!.stop()).toEqual({ steps: [{ intent: 'open_navigation_menu', expected: 'navigation_menu_visible', target: 'menu' }], valid: true, downloadObserved: false })
    await observer!.start(page)
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<p>Confirm your identity</p>'))
    expect((await observer!.stop()).valid).toBe(false)
  })

  it('classifies only fixed additional menu, download, and date-range label variants', async () => {
    await page.setContent(`${form}<nav role="menu"><button id="cue">Menu</button></nav>`)
    await create()
    for (const [label, intent, target] of [
      ['More options...', 'open_navigation_menu', 'more'], ['More...', 'open_navigation_menu', 'more'],
      ['More\u2026', 'open_navigation_menu', 'more'], ['Downloads', 'open_export_options', 'statements_documents'],
      ['Statements & documents', 'open_export_options', 'statements_documents'], ['Download activity', 'open_export_options', 'download_activity'],
      ['Choose date range', 'choose_date_range', 'custom_range'],
    ]) {
      await page.locator('#cue').evaluate((el, label) => { el.textContent = label }, label)
      await observer!.start(page); await page.locator('#cue').click()
      const result = await observer!.stop()
      expect(result.valid).toBe(true); expect(result.steps.map(step => [step.intent, step.target])).toEqual([[intent, target]])
    }
  })

  it('attributes a real download even when its event precedes the delayed binding callback and stop', async () => {
    const expose = context.exposeBinding.bind(context)
    let delivered = false, downloadFirst = false
    let startBinding!: () => void, releaseBinding!: () => void, releaseResponse!: () => void
    const bindingStarted = new Promise<void>(resolve => { startBinding = resolve })
    const bindingGate = new Promise<void>(resolve => { releaseBinding = resolve })
    const responseGate = new Promise<void>(resolve => { releaseResponse = resolve })
    await context.route('**/fixture.csv', async route => {
      await bindingStarted
      await responseGate
      await route.fulfill({ contentType: 'text/csv', headers: { 'content-disposition': 'attachment; filename="fixture.csv"' }, body: 'date,amount\n2026-09-01,1\n' })
    })
    vi.spyOn(context, 'exposeBinding').mockImplementation((name, callback, options) => expose(name, async (source, ...payload) => {
      if ((payload[0] as { intent?: unknown })?.intent === 'download_csv') { startBinding(); await bindingGate; delivered = true }
      return callback(source, ...payload)
    }, options))
    await page.setContent(form); await create(); await observer!.start(page); await click('CSV')
    page.once('download', () => { downloadFirst = !delivered; releaseBinding() })
    const capturePromise = capture()
    await bindingStarted
    releaseResponse()
    const result = await capturePromise
    expect(downloadFirst).toBe(true); expect(result.valid).toBe(true)
    expect(result.steps.map(step => step.intent)).toEqual(['select_csv', 'download_csv'])
  }, 10_000)

  it('allows download metadata delayed beyond one second while stop drains bounded verification', async () => {
    await page.setContent(form); await create()
    const listener = (page as unknown as { listeners(event: string): (() => void)[] }).listeners('download').at(-1)!
    const delayed = () => { setTimeout(listener, 1700) }
    page.off('download', listener).on('download', delayed)
    try {
      await observer!.start(page); await click('CSV')
      const result = await capture()
      expect(result.valid).toBe(true); expect(result.downloadObserved).toBe(true)
      expect(result.steps.at(-1)?.intent).toBe('download_csv')
    } finally { page.off('download', delayed) }
  })

  it('does not use an earlier agent download to verify a later manual Download with no event', async () => {
    await page.setContent(form); await create(); await observer!.start(page)
    await Promise.all([page.waitForEvent('download'), page.locator('a').evaluate(el => (el as HTMLAnchorElement).click())])
    await click('CSV')
    await page.locator('a').evaluate(el => { el.outerHTML = '<button>Download</button>' })
    await page.getByText('Download', { exact: true }).click()
    const result = await observer!.stop()
    expect(result.valid).toBe(false); expect(result.downloadObserved).toBe(true)
    expect(result.steps.map(step => step.intent)).toEqual(['select_csv'])
  }, 10_000)

  it('keeps a safe partial route valid after an unobserved agent download, without inventing a final manual step', async () => {
    await page.setContent(`${form}<nav role="menu"><button>Menu</button></nav>`)
    await create(); await observer!.start(page)
    await Promise.all([page.waitForEvent('download'), page.locator('a').evaluate(el => (el as HTMLAnchorElement).click())])
    await click('Menu')
    const result = await observer!.stop()
    expect(result.valid).toBe(true); expect(result.downloadObserved).toBe(true)
    expect(result.steps.map(step => step.intent)).toEqual(['open_navigation_menu'])
  })

  it('requires a matching account heading or a matched account click followed by account/activity navigation', async () => {
    documents.set('/accounts/detail', signedIn)
    await page.goto(`${origin}/accounts/detail`); await create(); await observer!.start(page)
    await bindingCall({ segment: 1, intent: 'open_selected_account', directCsv: false })
    const unmatched = await observer!.stop()
    expect(unmatched.valid).toBe(false); expect(unmatched.steps).toEqual([])
    documents.set('/accounts/next', signedIn)
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<a href="/accounts/next">Synthetic private checking (4321)</a>'))
    await observer!.start(page); await click('Synthetic private checking (4321)')
    const matched = await observer!.stop()
    expect(matched).toEqual({ steps: [{ intent: 'open_selected_account', expected: 'account_selected' }], valid: true, downloadObserved: false })
    expect(JSON.stringify(matched)).not.toMatch(/4321|Synthetic|accounts|https/)
  })

  it('rejects generic input clicks and unsupported date widgets without reading their values', async () => {
    await page.setContent(`${form}<input id="generic" aria-label="Notes"><div role="combobox" aria-label="Date picker"></div>`)
    await page.evaluate(() => {
      Object.defineProperty(document.getElementById('generic'), 'value', { get() { throw new Error('generic_value_must_not_be_read') } })
    })
    await create(); await observer!.start(page); await page.locator('#generic').click()
    expect((await observer!.stop()).valid).toBe(false)
    await observer!.start(page)
    await page.getByRole('combobox').evaluate(el => { (el as HTMLElement).style.cssText = 'width:100px;height:30px' })
    await page.getByRole('combobox').click()
    expect((await observer!.stop()).valid).toBe(false)
  })
})
