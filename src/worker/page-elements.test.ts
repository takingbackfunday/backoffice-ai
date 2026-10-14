import { existsSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { isCsvSelected, matchesDateRange, MAX_ELEMENTS, snapshotPage, type PageElement } from './page-elements'
import { getBank } from '@/lib/bank-import/banks'

const radio: PageElement = { id: 0, frameIndex: 0, tag: 'input', type: 'radio', text: 'CSV', disabled: false }

describe('isCsvSelected', () => {
  it('requires CSV to be checked, not merely available', () => {
    expect(isCsvSelected({ elements: [radio] })).toBe(false)
    expect(isCsvSelected({ elements: [{ ...radio, checked: false }] })).toBe(false)
    expect(isCsvSelected({ elements: [{ ...radio, checked: true }] })).toBe(true)
  })

  it('accepts a checked radio with a CSV accessible label', () => {
    expect(isCsvSelected({ elements: [{ ...radio, text: '', ariaLabel: 'CSV format', checked: true }] })).toBe(true)
  })

  it('does not mistake selected PDF or a download button for CSV selection', () => {
    expect(isCsvSelected({ elements: [{ ...radio, text: 'PDF', checked: true }, radio] })).toBe(false)
    expect(isCsvSelected({ elements: [{ ...radio, tag: 'button', text: 'Download CSV', checked: true }] })).toBe(false)
  })

  it('checks the selected dropdown value, not its available options', () => {
    const select = { ...radio, tag: 'select', value: 'PDF', options: ['PDF', 'Spreadsheet (CSV)'] }
    expect(isCsvSelected({ elements: [select] })).toBe(false)
    expect(isCsvSelected({ elements: [{ ...select, value: 'Spreadsheet (CSV)' }] })).toBe(true)
    expect(isCsvSelected({ elements: [{ ...select, value: 'Excel' }] })).toBe(false)
  })

  it('requires checked ARIA radios or selected options to explicitly say CSV', () => {
    for (const role of ['radio', 'option']) {
      const option = { ...radio, tag: 'div', type: undefined, role }
      expect(isCsvSelected({ elements: [option] })).toBe(false)
      expect(isCsvSelected({ elements: [{ ...option, checked: false }] })).toBe(false)
      expect(isCsvSelected({ elements: [{ ...option, checked: true }] })).toBe(true)
      expect(isCsvSelected({ elements: [{ ...option, text: '', ariaLabel: 'CSV format', checked: true }] })).toBe(true)
      expect(isCsvSelected({ elements: [{ ...option, text: 'Excel', checked: true }] })).toBe(false)
      expect(isCsvSelected({ elements: [{ ...option, text: 'NotCSV', checked: true }] })).toBe(false)
    }
  })
})

const chromeAvailable = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/google/chrome/chrome'].some(existsSync)

describe('matchesDateRange', () => {
  const start: PageElement = { id: 0, frameIndex: 0, tag: 'input', type: 'text', text: 'From date', value: '01/09/2026', disabled: false }
  const end: PageElement = { ...start, id: 1, text: 'To date', value: '09/10/2026' }
  const matches = (elements: PageElement[]) => matchesDateRange({ elements }, getBank('n26')!, '2026-09-01', '2026-10-09')
  it('requires exactly one unambiguous matching input for each endpoint', () => {
    expect(matches([start, end])).toBe(true)
    expect(matches([start])).toBe(false)
    expect(matches([start, end, { ...start, id: 2 }])).toBe(false)
    expect(matches([{ ...start, text: 'From/To date' }, end])).toBe(false)
    expect(matches([{ ...start, value: '08/10/2026' }, end])).toBe(false)
    expect(matches([{ ...start, value: undefined }, end])).toBe(false)
  })
  it('uses native ISO values or field-specific locale hints rather than the bank default', () => {
    expect(matches([{ ...start, type: 'date', value: '2026-09-01' }, { ...end, type: 'date', value: '2026-10-09' }])).toBe(true)
    expect(matches([{ ...start, placeholder: 'MM/DD/YYYY', value: '09/01/2026' }, { ...end, placeholder: 'MM/DD/YYYY', value: '10/09/2026' }])).toBe(true)
  })

  it('revalidates text inputs whose calendar stores ISO dates despite localized placeholders', () => {
    const elements = [{ ...start, placeholder: 'DD/MM/YYYY', value: '2026-09-01' }, { ...end, placeholder: 'DD/MM/YYYY', value: '2026-10-09' }]
    expect(matches(elements)).toBe(true)
    expect(matches([{ ...elements[0], value: '2026-09-02' }, elements[1]])).toBe(false)
    expect(matches([{ ...elements[0], value: '2026-02-30' }, elements[1]])).toBe(false)
  })

  it('verifies label-ambiguous fields using their nominated identities, never value or order alone', () => {
    const elements = [{ ...start, text: 'Date', domId: 'range:start', frameId: 0 }, { ...end, text: 'Date', domId: 'range:end', frameId: 0 }]
    const bank = getBank('n26')!
    const from = { domId: 'range:start', frameId: 0 }, to = { domId: 'range:end', frameId: 0 }
    expect(matches(elements)).toBe(false)
    expect(matchesDateRange({ elements }, bank, '2026-09-01', '2026-10-09', { from, to })).toBe(true)
    expect(matchesDateRange({ elements: [...elements].reverse() }, bank, '2026-09-01', '2026-10-09', { from, to })).toBe(true)
    expect(matchesDateRange({ elements }, bank, '2026-09-01', '2026-10-09', { from: to, to: from })).toBe(false)
    expect(matchesDateRange({ elements }, bank, '2026-09-01', '2026-10-09', { from })).toBe(false)
    expect(matchesDateRange({ elements }, bank, '2026-09-01', '2026-10-09', { from, to: from })).toBe(false)
    expect(matchesDateRange({ elements: [...elements, { ...elements[0], id: 2 }] }, bank, '2026-09-01', '2026-10-09', { from, to })).toBe(false)
    const otherFrame = elements.map(element => ({ ...element, frameIndex: 1, frameId: 1 }))
    expect(matchesDateRange({ elements: [...elements, ...otherFrame] }, bank, '2026-09-01', '2026-10-09', { from, to })).toBe(true)
    expect(matchesDateRange({ elements: otherFrame }, bank, '2026-09-01', '2026-10-09', { from, to })).toBe(false)
  })
})

describe.skipIf(!chromeAvailable)('snapshotPage with synthetic local Chrome', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page

  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking'] })
  })
  beforeEach(async () => {
    context = await browser.newContext({ serviceWorkers: 'block' })
    await context.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: '<body></body>' }))
    page = await context.newPage()
    await page.goto('http://127.0.0.1/snapshot-fixture')
  })
  afterEach(async () => { await context?.close() })
  afterAll(async () => { await browser?.close() })

  it('retains date values and select choices, never generic text/search, usernames, or OTP values', async () => {
    await page.setContent(`
      <input name="plain" value="private-text">
      <input type="search" name="search" value="private-search">
      <input name="username" aria-label="Username" value="private-user">
      <input name="date-username" aria-label="Username" placeholder="YYYY-MM-DD" value="private-user">
      <input name="otp" aria-label="Verification code" autocomplete="one-time-code" value="123456">
      <input name="date-otp" aria-label="Verification date code" placeholder="DD/MM/YYYY" value="654321">
      <input name="password" type="password" value="private-password">
      <input name="hidden" type="hidden" value="private-hidden">
      <input name="native" type="date" value="2026-09-01">
      <label>From date <input name="labelled" value="01/09/2026"></label>
      <input name="hinted" placeholder="DD/MM/YYYY" value="09/10/2026">
      <input name="aria" aria-label="End date" value="09/10/2026">
      <span id="start-label">Start date</span><input name="labelledby" aria-labelledby="start-label" value="01/09/2026">
      <input name="datum" aria-label="Datum" value="01.09.2026">
      <input name="german-hint" placeholder="TT.MM.JJJJ" value="01.09.2026">
      <input name="search-date" type="search" placeholder="DD / MM / YYYY" value="01/09/2026">
      <select name="format"><option>PDF</option><option selected>Spreadsheet (CSV)</option></select>
    `)
    const snapshot = await snapshotPage(page)
    const values = Object.fromEntries(snapshot.elements.map((element) => [element.name, element.value]))
    expect(values).toMatchObject({
      plain: undefined, search: undefined, username: undefined, 'date-username': undefined, otp: undefined, 'date-otp': undefined,
      native: '2026-09-01', labelled: '01/09/2026', hinted: '09/10/2026', aria: '09/10/2026',
      labelledby: '01/09/2026', datum: '01.09.2026', 'german-hint': '01.09.2026', 'search-date': '01/09/2026', format: 'Spreadsheet (CSV)',
    })
    expect(values).not.toHaveProperty('password')
    expect(values).not.toHaveProperty('hidden')
    expect(JSON.stringify(snapshot)).not.toMatch(/private-text|private-search|private-user|123456|654321|private-password|private-hidden/)
    expect(isCsvSelected(snapshot)).toBe(true)
  })

  it('discovers nested open roots on non-interactive hosts and preserves locators and ARIA state', async () => {
    await page.setContent('<div id="host"></div>')
    await page.evaluate(() => {
      const root = document.getElementById('host')!.attachShadow({ mode: 'open' })
      root.innerHTML = '<section></section>'
      root.querySelector('section')!.attachShadow({ mode: 'open' }).innerHTML = `
        <span id="date-label">Start date</span><input name="date" aria-labelledby="date-label" value="01/09/2026">
        <div role="radio" aria-checked="false">CSV</div>
        <div role="radio" aria-checked="true">PDF</div>
        <div role="option" aria-selected="false">CSV</div>
        <div role="option" aria-selected="true">PDF</div>
        <div role="checkbox" aria-checked="mixed">Other</div>
      `
    })
    let snapshot = await snapshotPage(page)
    expect(snapshot.snapshotFailureCount).toBe(0)
    expect(snapshot.elements).toHaveLength(6)
    expect(snapshot.elements.find((element) => element.name === 'date')?.value).toBe('01/09/2026')
    expect(snapshot.elements.map((element) => element.checked)).toEqual([undefined, false, true, false, true, false])
    expect(isCsvSelected(snapshot)).toBe(false)
    const option = snapshot.elements.find((element) => element.role === 'option' && element.text === 'CSV')!
    expect(await snapshot.locate(option.id)!.getAttribute('aria-selected')).toBe('false')
    await snapshot.locate(option.id)!.evaluate((element) => element.setAttribute('aria-selected', 'true'))
    snapshot = await snapshotPage(page)
    expect(isCsvSelected(snapshot)).toBe(true)
    await page.getByRole('option', { name: 'CSV' }).evaluate((element) => element.setAttribute('aria-selected', 'false'))
    await page.getByRole('radio', { name: 'CSV' }).evaluate((element) => element.setAttribute('aria-checked', 'true'))
    expect(isCsvSelected(await snapshotPage(page))).toBe(true)
  })

  it('bounds discovery and output for large DOMs and many open roots', async () => {
    await page.setContent('<button>Export</button>'.repeat(MAX_ELEMENTS + 20))
    expect((await snapshotPage(page)).elements).toHaveLength(MAX_ELEMENTS)
    await page.setContent('<div></div>'.repeat(5000) + '<button>Outside scan budget</button>')
    expect((await snapshotPage(page)).elements).toHaveLength(0)
    await page.setContent('<div class="host"></div>'.repeat(40))
    await page.evaluate(() => {
      document.querySelectorAll('.host').forEach((host) => {
        host.attachShadow({ mode: 'open' }).innerHTML = '<button>Export</button>'
      })
    })
    expect((await snapshotPage(page)).elements).toHaveLength(31)
  })

  it('exposes labelled read-only inputs and calendar gridcells with full accessible dates', async () => {
    await page.setContent(`
      <span id="from-label">From date</span><input name="from" aria-labelledby="from-label" placeholder="DD/MM/YYYY" value="01/09/2026" readonly>
      <div role="grid" aria-label="September 2026">
        <span id="full-day">September 1, 2026</span>
        <div role="gridcell" tabindex="0" aria-labelledby="full-day" aria-selected="true">1</div>
        <div role="gridcell" aria-label="October 1, 2026" aria-disabled="true">1</div>
      </div>
    `)
    const snapshot = await snapshotPage(page)
    expect(snapshot.elements[0]).toMatchObject({ text: 'From date', readOnly: true, value: '01/09/2026' })
    expect(snapshot.elements[1]).toMatchObject({ role: 'gridcell', text: '1', ariaLabel: 'September 1, 2026', checked: true, disabled: false })
    expect(snapshot.elements[2]).toMatchObject({ role: 'gridcell', text: '1', ariaLabel: 'October 1, 2026', disabled: true })
    expect(await snapshot.locate(snapshot.elements[1].id)!.getAttribute('aria-labelledby')).toBe('full-day')
  })

  it('retains stable identity only for known date inputs and refuses ambiguous live IDs', async () => {
    await page.setContent(`
      <input id="private-field" name="username" value="private-user">
      <label>Date <input id="range:start" placeholder="DD/MM/YYYY" value="01/09/2026"></label>
    `)
    const snapshot = await snapshotPage(page)
    expect(snapshot.elements[0].domId).toBeUndefined()
    expect(snapshot.elements[1].domId).toBe('range:start')
    const locator = snapshot.locate(snapshot.elements[1].id)!
    await page.locator('input[id="range:start"]').evaluate(input => {
      input.removeAttribute('data-bi-idx')
    })
    expect(await locator.inputValue({ timeout: 200 })).toBe('01/09/2026')
    await page.evaluate(() => {
      const input = document.querySelector('input[id="range:start"]')!
      input.parentElement!.appendChild(input.cloneNode())
    })
    await expect(locator.inputValue({ timeout: 200 })).rejects.toThrow(/strict mode violation/)
  })
})
