import { existsSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getBank } from '@/lib/bank-import/banks'
import { executeAction } from './actions'
import { matchesDateRange, snapshotPage } from './page-elements'

const chromeAvailable = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/google/chrome/chrome'].some(existsSync)

describe.skipIf(!chromeAvailable)('bank date entry with synthetic local Chrome', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page
  const from = '2026-09-01'
  const to = '2026-10-09'

  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking'] })
  })
  beforeEach(async () => {
    context = await browser.newContext({ serviceWorkers: 'block' })
    await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<body></body>' }))
    page = await context.newPage()
    await page.goto('http://127.0.0.1/date-entry-fixture')
  })
  afterEach(async () => { await context?.close() })
  afterAll(async () => { await browser?.close() })

  async function setDate(field: 'from' | 'to') {
    const snap = await snapshotPage(page)
    const element = snap.elements.find(candidate => candidate.name === field)!
    return executeAction({ page, snap, bank: getBank('n26')!, from, to,
      action: { action: 'fill_date', elementId: element.id, dateField: field,
        intent: field === 'from' ? 'set_date_from' : 'set_date_to', reason: 'Set requested date' } })
  }

  async function downloadText() {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download CSV' }).click()
    const stream = await (await pending).createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks).toString('utf8')
  }

  it('commits a keyboard-driven controlled widget and exports the requested range, not just matching DOM text', async () => {
    await page.setContent(`
      <label>From date <input name="from" placeholder="DD/MM/YYYY" value="08/10/2026"></label>
      <label>To date <input name="to" placeholder="DD/MM/YYYY" value="09/10/2026"></label>
      <button>Download CSV</button>
      <script>
        const state = { from: '08/10/2026', to: '09/10/2026' };
        for (const input of document.querySelectorAll('input')) {
          let keyboardEdit = false;
          input.addEventListener('keydown', event => { if (event.key.length === 1) keyboardEdit = true; });
          input.addEventListener('blur', () => {
            if (keyboardEdit && /^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(input.value)) state[input.name] = input.value;
            keyboardEdit = false;
          });
        }
        document.querySelector('button').onclick = () => {
          const iso = value => value.split('/').reverse().join('-');
          const csv = 'Date,Description,Amount\\n' + iso(state.from) + ',Start fixture,1\\n' + iso(state.to) + ',End fixture,2\\n';
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
          a.download = 'synthetic.csv'; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 0);
        };
      </script>
    `)
    // Reproduce the old false positive: fill + blur changes DOM, not the widget's export state.
    await page.locator('[name="from"]').fill('01/09/2026')
    await page.locator('[name="from"]').press('Tab')
    expect(await page.locator('[name="from"]').inputValue()).toBe('01/09/2026')
    expect(await downloadText()).toContain('2026-10-08,Start fixture')

    expect(await setDate('from')).toMatchObject({ ok: true, verifiedValue: '01/09/2026' })
    expect(await setDate('to')).toMatchObject({ ok: true, verifiedValue: '09/10/2026' })
    expect(await downloadText()).toBe('Date,Description,Amount\n2026-09-01,Start fixture,1\n2026-10-09,End fixture,2\n')
  })

  it('retains native date input support and commits its ISO values to the export', async () => {
    await page.setContent(`
      <label>From date <input type="date" name="from" value="2026-10-08"></label>
      <label>To date <input type="date" name="to" value="2026-10-09"></label>
      <output></output>
      <script>
        const state = {};
        for (const input of document.querySelectorAll('input')) {
          input.addEventListener('change', () => {
            state[input.name] = input.value;
            document.querySelector('output').textContent = JSON.stringify(state);
          });
        }
      </script>
    `)
    expect(await setDate('from')).toMatchObject({ ok: true, verifiedValue: from })
    expect(await setDate('to')).toMatchObject({ ok: true, verifiedValue: to })
    expect(JSON.parse(await page.locator('output').innerText())).toEqual({ from, to })
  })

  it('fails safely on a calendar-only field without changing its selected date', async () => {
    await page.setContent('<label>From date <input name="from" placeholder="DD/MM/YYYY" value="08/10/2026" readonly></label>')
    // Reduce only the fixture timeout; production retains the bounded ten-second action timeout.
    const snap = await snapshotPage(page)
    const locator = snap.locate(snap.elements[0].id)!
    const original = locator.pressSequentially.bind(locator)
    locator.pressSequentially = (value, options) => original(value, { ...options, timeout: 200 })
    snap.locate = () => locator
    const result = await executeAction({ page, snap, bank: getBank('n26')!, from, to,
      action: { action: 'fill_date', elementId: snap.elements[0].id, dateField: 'from', intent: 'set_date_from', reason: 'Set requested date' } })
    expect(result.ok).toBe(false)
    expect(result.verifiedValue).toBeUndefined()
    expect(await page.locator('input').inputValue()).toBe('08/10/2026')
  })

  it('does not verify a text date when the widget traps Tab instead of committing on blur', async () => {
    await page.setContent(`
      <label>From date <input name="from" placeholder="DD/MM/YYYY" value="08/10/2026"></label>
      <output>08/10/2026</output>
      <script>
        const input = document.querySelector('input');
        input.addEventListener('keydown', event => { if (event.key === 'Tab') event.preventDefault(); });
        input.addEventListener('blur', () => { document.querySelector('output').textContent = input.value; });
      </script>
    `)
    const result = await setDate('from')
    expect(result).toMatchObject({ ok: false })
    expect(result.verifiedValue).toBeUndefined()
    expect(await page.locator('output').innerText()).toBe('08/10/2026')
  })

  it('commits calendar-only export state through opening, month navigation, day selection and Apply', async () => {
    await page.setContent(`
      <label>From date <input name="from" placeholder="DD/MM/YYYY" value="01/09/2026" readonly></label>
      <label>To date <input name="to" placeholder="DD/MM/YYYY" value="09/10/2026" readonly></label>
      <section id="calendar" hidden>
        <h2>October 2026</h2><button id="previous">Previous month</button>
        <div role="gridcell" tabindex="0" aria-label="October 1, 2026" aria-disabled="true">1</div>
        <div id="day" role="gridcell" tabindex="0" aria-label="October 9, 2026">9</div>
        <button id="apply">Apply</button>
      </section>
      <button id="download">Download CSV</button>
      <script>
        const state = { from: '08/10/2026', to: '08/10/2026' };
        let field, draft;
        const calendar = document.getElementById('calendar');
        const day = document.getElementById('day');
        for (const input of document.querySelectorAll('input')) input.onclick = () => {
          field = input; draft = null; calendar.hidden = false;
          calendar.querySelector('h2').textContent = 'October 2026';
          day.textContent = '9'; day.setAttribute('aria-label', 'October 9, 2026');
        };
        document.getElementById('previous').onclick = () => {
          calendar.querySelector('h2').textContent = 'September 2026';
          day.textContent = '1'; day.setAttribute('aria-label', 'September 1, 2026');
        };
        day.onclick = () => { draft = day.textContent === '1' ? '01/09/2026' : '09/10/2026'; };
        document.getElementById('apply').onclick = () => {
          if (draft) { state[field.name] = draft; field.value = draft; calendar.hidden = true; }
        };
        document.getElementById('download').onclick = () => {
          const iso = value => value.split('/').reverse().join('-');
          const csv = 'Date,Description,Amount\\n' + iso(state.from) + ',Start fixture,1\\n' + iso(state.to) + ',End fixture,2\\n';
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
          a.download = 'synthetic.csv'; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 0);
        };
      </script>
    `)
    expect(await downloadText()).toContain('2026-10-08,Start fixture')
    async function clickCalendar(field: 'from' | 'to', target: string, complete = false) {
      const snap = await snapshotPage(page)
      const input = snap.elements.find(element => element.name === field)!
      const element = target === 'input' ? input : snap.elements.find(element => element.text === target && !element.disabled)!
      return executeAction({ page, snap, bank: getBank('n26')!, from, to,
        action: { action: 'click', elementId: element.id, dateField: field, dateInputId: complete ? input.id : undefined,
          intent: field === 'from' ? 'set_date_from' : 'set_date_to', reason: 'Choose the requested calendar date' } })
    }
    const opened = await clickCalendar('from', 'input')
    expect(opened.ok).toBe(true)
    expect(opened.verifiedValue).toBeUndefined()
    expect((await clickCalendar('from', 'Previous month')).verifiedValue).toBeUndefined()
    expect((await clickCalendar('from', '1')).verifiedValue).toBeUndefined()
    // Day selection is only a draft until Apply, even when the input displays matching text already.
    expect(await downloadText()).toContain('2026-10-08,Start fixture')
    expect(await clickCalendar('from', 'Apply', true)).toMatchObject({ ok: true, verifiedValue: '01/09/2026' })
    expect((await clickCalendar('to', 'input')).verifiedValue).toBeUndefined()
    expect((await clickCalendar('to', '9')).verifiedValue).toBeUndefined()
    expect(await clickCalendar('to', 'Apply', true)).toMatchObject({ ok: true, verifiedValue: '09/10/2026' })
    expect(await downloadText()).toBe('Date,Description,Amount\n2026-09-01,Start fixture,1\n2026-10-09,End fixture,2\n')
  })

  it('rejects the wrong or disabled calendar day without editing the input', async () => {
    await page.setContent(`
      <label>From date <input name="from" placeholder="DD/MM/YYYY" value="08/10/2026" readonly></label>
      <button aria-label="September 2, 2026" onclick="document.querySelector('input').value='02/09/2026'">2</button>
      <div role="gridcell" aria-label="September 1, 2026" aria-disabled="true" onclick="document.querySelector('input').value='01/09/2026'">1</div>
    `)
    for (const text of ['2', '1']) {
      const snap = await snapshotPage(page)
      const result = await executeAction({ page, snap, bank: getBank('n26')!, from, to,
        action: { action: 'click', elementId: snap.elements.find(element => element.text === text)!.id,
          dateField: 'from', dateInputId: snap.elements.find(element => element.name === 'from')!.id,
          intent: 'set_date_from', reason: 'Choose start day' } })
      expect(result.ok).toBe(false)
      expect(result.verifiedValue).toBeUndefined()
    }
    expect(await page.locator('input').inputValue()).toBe('02/09/2026')
  })

  it('verifies a date input that the calendar replaces without its temporary snapshot index', async () => {
    page.setDefaultTimeout(200)
    await page.setContent(`
      <label for="range:start">Date <input id="range:start" placeholder="DD/MM/YYYY" value="08/10/2026"></label>
      <button onclick="const input=document.querySelector('input'); const replacement=input.cloneNode(); replacement.removeAttribute('data-bi-idx'); replacement.value='01/09/2026'; input.replaceWith(replacement);">September 1, 2026</button>
    `)
    const snap = await snapshotPage(page)
    const input = snap.elements.find(element => element.tag === 'input')!
    const day = snap.elements.find(element => element.tag === 'button')!
    const result = await executeAction({ page, snap, bank: getBank('n26')!, from, to,
      action: { action: 'click', elementId: day.id, dateInputId: input.id, dateField: 'from', intent: 'set_date_from', reason: 'Select start day' } })
    expect(await page.locator('input').inputValue()).toBe('01/09/2026')
    expect(await page.locator('input').getAttribute('data-bi-idx')).toBeNull()
    expect(result).toMatchObject({ ok: true, verifiedValue: '01/09/2026' })
  })

  it('verifies and exports calendar-selected ISO values from unlabelled text inputs with localized placeholders', async () => {
    await page.setContent(`
      <input id="range:start" placeholder="DD/MM/YYYY" value="2026-10-08" readonly>
      <input id="range:end" placeholder="DD/MM/YYYY" value="2026-10-08" readonly>
      <button id="start-day">September 1, 2026</button>
      <button id="end-day">October 9, 2026</button>
      <button id="download">Download CSV</button>
      <script>
        const state = { from: '2026-10-08', to: '2026-10-08' };
        document.getElementById('start-day').onclick = () => {
          state.from = '2026-09-01'; document.getElementById('range:start').value = state.from;
        };
        document.getElementById('end-day').onclick = () => {
          state.to = '2026-10-09'; document.getElementById('range:end').value = state.to;
        };
        document.getElementById('download').onclick = () => {
          const csv = 'Date,Description,Amount\\n' + state.from + ',Start fixture,1\\n' + state.to + ',End fixture,2\\n';
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
          a.download = 'synthetic.csv'; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 0);
        };
      </script>
    `)
    const inputIds: Parameters<typeof matchesDateRange>[4] = {}
    for (const field of ['from', 'to'] as const) {
      const snap = await snapshotPage(page)
      const input = snap.elements.find(element => element.domId === `range:${field === 'from' ? 'start' : 'end'}`)!
      const day = snap.elements.find(element => element.text === (field === 'from' ? 'September 1, 2026' : 'October 9, 2026'))!
      const result = await executeAction({ page, snap, bank: getBank('n26')!, from, to,
        action: { action: 'click', elementId: day.id, dateInputId: input.id, dateField: field, intent: `set_date_${field}`, reason: 'Select requested date' } })
      expect(result).toMatchObject({ ok: true, verifiedValue: field === 'from' ? from : to })
      inputIds[field] = { domId: input.domId!, frameId: input.frameId! }
    }
    expect(matchesDateRange(await snapshotPage(page), getBank('n26')!, from, to, inputIds)).toBe(true)
    expect(await downloadText()).toBe('Date,Description,Amount\n2026-09-01,Start fixture,1\n2026-10-09,End fixture,2\n')
  })
})
