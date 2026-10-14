import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: { transaction: mocks } }))
vi.mock('@/lib/invoice-matching', () => ({ matchInvoicePayments: vi.fn() }))
vi.mock('@/lib/receipt-matching', () => ({ matchReceiptTransactions: vi.fn() }))

import { PATCH } from '@/app/api/transactions/[id]/route'
import { GET } from '@/app/api/transactions/route'

const originalDate = '2026-10-09T00:00:00.000Z'
const selectedDate = '2026-03-08'
const selectedTimestamp = `${selectedDate}T00:00:00.000Z`
const fixtureRow = (id: string) => ({
  id, accountId: 'synthetic-account', date: originalDate, amount: '12.50',
  description: 'Synthetic transaction', notes: null, category: null, categoryId: null,
  categoryRef: null, payeeId: null, payee: null, workspaceId: null, workspace: null, receipts: [],
  account: { id: 'synthetic-account', name: 'Synthetic account', currency: 'USD', userId: 'synthetic-owner' },
})

const chromeAvailable = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/google/chrome/chrome'].some(existsSync)

describe.skipIf(!chromeAvailable)('transaction date editing with actual React UI and mocked storage', () => {
  let browser: Browser
  let context: BrowserContext | undefined
  let page: Page
  let bundle: string
  let stored: ReturnType<typeof fixtureRow>[]
  let patches: { id: string; body: { date?: string } }[]
  let releasePatch: (() => void) | undefined
  let patchGate: Promise<void> | undefined
  let releaseSearch: (() => void) | undefined
  let searchGate: Promise<void> | undefined
  let failPatch: boolean
  const pageErrors: string[] = []
  const unexpectedRequests: string[] = []

  beforeAll(async () => {
    // Reuse tsx's installed bundler without adding a dependency or reading env files.
    const require = createRequire(import.meta.url)
    const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild')
    const result = await build({
      absWorkingDir: path.resolve(import.meta.dirname, '../../../..'),
      stdin: {
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { TransactionTable } from '@/components/transactions/transaction-table';
          import { useInlineEdit } from '@/components/transactions/hooks/use-inline-edit';
          const rows = ${JSON.stringify([fixtureRow('synthetic-row'), fixtureRow('synthetic-other')])};
          function HookFixture() {
            const [localRows, setLocalRows] = React.useState(rows);
            const edit = useInlineEdit({ localRows, setLocalRows, setError: () => {},
              projects: [], categoryGroups: [], payees: [], setPayees: () => {},
              selectMode: false, deletingIds: new Set(), setDeletingIds: () => {} });
            window.fixtureCommitDate = value => edit.commitEdit(rows[0].id, 'date', value);
            window.fixtureEdit = edit;
            window.fixtureSetRows = setLocalRows;
            return <output id="hook-date">{localRows[0] ? new Date(localRows[0].date).toISOString() : 'missing'}</output>;
          }
          let root;
          window.fixtureMount = (initial = true) => {
            root?.unmount();
            root = createRoot(document.getElementById('root'));
            root.render(initial === 'hook' ? <HookFixture /> : <TransactionTable initialRows={initial ? rows : undefined}
              initialTotal={2} initialWorkspaces={[]} initialCategoryGroups={[]}
              initialPayees={[]} initialAccounts={[]} />);
          };
          window.fixtureMount();
        `,
        loader: 'tsx', resolveDir: path.resolve(import.meta.dirname, '../../../..'),
      },
      bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"test"' },
      plugins: [{
        name: 'isolate-unrelated-rule-ui',
        setup(builder: {
          onResolve: (options: { filter: RegExp }, callback: () => { path: string; namespace: string }) => void
          onLoad: (options: { filter: RegExp; namespace: string }, callback: () => { contents: string }) => void
        }) {
          builder.onResolve({ filter: /^@\/components\/rules\/(rule-editor|rules-agent)$/ }, () => ({ path: 'rule-ui', namespace: 'fixture' }))
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const RuleEditor = () => null; export const RulesAgent = () => null;' }))
        },
      }],
      logLevel: 'silent',
    })
    bundle = result.outputFiles[0].text
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking'] })
  })

  beforeEach(() => {
    vi.resetAllMocks()
    stored = [fixtureRow('synthetic-row'), fixtureRow('synthetic-other')]
    patches = []
    pageErrors.length = 0
    unexpectedRequests.length = 0
    failPatch = false
    patchGate = undefined
    releasePatch = undefined
    searchGate = undefined
    releaseSearch = undefined
    mocks.auth.mockResolvedValue({ userId: 'synthetic-owner' })
    mocks.findFirst.mockImplementation(async ({ where }) => stored.find(row => row.id === where.id && row.account.userId === where.account.userId) ?? null)
    mocks.update.mockImplementation(async ({ where, data }) => {
      if (failPatch) throw new Error('Synthetic persistence failure')
      const index = stored.findIndex(row => row.id === where.id)
      stored[index] = { ...stored[index], ...data, date: data.date?.toISOString() ?? stored[index].date }
      return stored[index]
    })
    mocks.count.mockImplementation(async ({ where }) => where.OR?.[0]?.description?.contains === 'no-match' ? 0 : stored.length)
    mocks.findMany.mockImplementation(async ({ where }) => where.OR?.[0]?.description?.contains === 'no-match' ? [] : stored)
  })

  afterEach(async () => {
    releasePatch?.()
    releaseSearch?.()
    await context?.close()
    context = undefined
    expect(pageErrors).toEqual([])
    expect(unexpectedRequests).toEqual([])
    vi.restoreAllMocks()
  })
  afterAll(async () => { await browser?.close() })

  async function mount(timezoneId = 'UTC') {
    context = await browser.newContext({ timezoneId, locale: 'en-US', serviceWorkers: 'block' })
    await context.route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin !== 'http://127.0.0.1') {
        unexpectedRequests.push(url.origin)
        await route.abort()
        return
      }
      if (url.pathname === '/fixture') {
        await route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><button id="outside">Outside</button>' })
        return
      }
      if (url.pathname === '/api/llm/suggest-category') {
        await route.fulfill({ json: { data: { suggestions: [] }, error: null } })
        return
      }
      let response: Response
      if (url.pathname.startsWith('/api/transactions/') && request.method() === 'PATCH') {
        const id = url.pathname.split('/').at(-1)!
        const body = request.postDataJSON()
        patches.push({ id, body })
        await patchGate
        response = await PATCH(new Request(request.url(), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
      } else if (url.pathname === '/api/transactions' && request.method() === 'GET') {
        if (url.searchParams.get('search') === 'no-match') await searchGate
        response = await GET(new Request(request.url()))
      } else {
        unexpectedRequests.push(`${request.method()} ${url.pathname}`)
        await route.abort()
        return
      }
      await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() })
    })
    page = await context.newPage()
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.goto('http://127.0.0.1/fixture')
    await page.addScriptTag({ content: bundle })
    await page.waitForSelector('[data-testid="cell-date"]')
  }

  const row = () => page.locator('[data-row-id="synthetic-row"]')
  const dateInput = () => row().locator('input[type="date"]')
  async function selectDate(value = selectedDate) {
    await row().locator('[data-testid="cell-date"]').click()
    await dateInput().fill(value)
    expect(await dateInput().inputValue()).toBe(value)
    expect(patches).toHaveLength(0)
  }

  it.each(['UTC', 'America/Los_Angeles', 'Pacific/Auckland'])('Done persists the selected day and reloads correctly in %s', async timezone => {
    await mount(timezone)
    expect(await row().locator('[data-testid="cell-date"]').innerText()).toBe('10/9/2026')
    await selectDate()
    await row().getByRole('button', { name: 'Done', exact: true }).first().click()
    await expect.poll(() => patches).toEqual([{ id: 'synthetic-row', body: { date: selectedTimestamp } }])
    await expect.poll(() => stored[0].date).toBe(selectedTimestamp)
    await expect.poll(async () => row().locator('[data-testid="cell-date"]').innerText()).toBe('3/8/2026')
    expect(mocks.update.mock.calls[0][0].data.date.toISOString()).toBe(selectedTimestamp)
    await page.evaluate('window.fixtureMount(false)')
    await expect.poll(async () => row().locator('[data-testid="cell-date"]').innerText()).toBe('3/8/2026')
    await row().locator('[data-testid="cell-date"]').click()
    expect(await dateInput().inputValue()).toBe(selectedDate)
    expect(patches).toHaveLength(1)
  })

  it.each(['trailing Done', 'Enter', 'keyboard Done', 'blur to another cell', 'outside click', 'another row'])('commits once on %s', async action => {
    await mount()
    await selectDate()
    if (action === 'trailing Done') await row().getByRole('button', { name: 'Done', exact: true }).last().click()
    if (action === 'Enter') await dateInput().press('Enter')
    if (action === 'keyboard Done') {
      await row().getByRole('button', { name: 'Done', exact: true }).first().focus()
      await page.keyboard.press('Enter')
    }
    if (action === 'blur to another cell') await row().locator('input[type="text"]').first().focus()
    if (action === 'outside click') await page.locator('#outside').click()
    if (action === 'another row') await page.locator('[data-row-id="synthetic-other"] [data-testid="cell-date"]').click()
    await expect.poll(() => stored[0].date).toBe(selectedTimestamp)
    await page.waitForTimeout(100)
    expect(patches).toEqual([{ id: 'synthetic-row', body: { date: selectedTimestamp } }])
  })

  it('keeps an optimistic selected day while PATCH is pending', async () => {
    patchGate = new Promise(resolve => { releasePatch = resolve })
    await mount('America/Los_Angeles')
    await selectDate()
    await row().getByRole('button', { name: 'Done', exact: true }).first().click()
    await expect.poll(() => patches.length).toBe(1)
    expect(stored[0].date).toBe(originalDate)
    expect(await row().locator('[data-testid="cell-date"]').innerText()).toBe('3/8/2026')
    releasePatch!()
    await expect.poll(() => stored[0].date).toBe(selectedTimestamp)
  })

  it('rolls back and marks the row when persistence fails', async () => {
    failPatch = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await mount()
    await selectDate()
    await row().getByRole('button', { name: 'Done', exact: true }).first().click()
    await expect.poll(() => mocks.update.mock.calls.length).toBe(1)
    await expect.poll(async () => row().locator('[data-testid="cell-date"]').getAttribute('class')).toContain('ring-red-400')
    expect(await row().locator('[data-testid="cell-date"]').innerText()).toBe('10/9/2026')
    expect(stored[0].date).toBe(originalDate)
  })

  it('does not PATCH unchanged dates or an Escape-cancelled draft', async () => {
    await mount()
    await row().locator('[data-testid="cell-date"]').click()
    await row().getByRole('button', { name: 'Done', exact: true }).first().click()
    await selectDate()
    await dateInput().press('Escape')
    expect(await row().locator('[data-testid="cell-date"]').innerText()).toBe('10/9/2026')
    expect(patches).toEqual([])
  })

  it.each(['unchanged', 'restored'])('does not PATCH an %s date on Enter', async draft => {
    await mount()
    await row().locator('[data-testid="cell-date"]').click()
    if (draft === 'restored') {
      await dateInput().fill(selectedDate)
      await dateInput().fill(originalDate.slice(0, 10))
    }
    await dateInput().press('Enter')
    expect(await row().locator('[data-testid="cell-date"]').innerText()).toBe('10/9/2026')
    await page.waitForTimeout(100)
    expect(patches).toEqual([])
    expect(stored[0].date).toBe(originalDate)
  })

  it.each(['', 'not-a-date', '2026-02-30', '2026-1-1', '2026-03-08T00:00:00.000Z'])('the actual hook rejects invalid calendar input (%s)', async value => {
    await mount()
    await page.evaluate("window.fixtureMount('hook')")
    await page.waitForSelector('#hook-date')
    await page.evaluate(`window.fixtureCommitDate(${JSON.stringify(value)})`)
    expect(await page.locator('#hook-date').innerText()).toBe(originalDate)
    expect(patches).toEqual([])
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each(['', '2026-10-09'])('does not persist a cleared or restored date draft (%s)', async value => {
    await mount()
    await selectDate()
    await dateInput().fill(value)
    await row().getByRole('button', { name: 'Done', exact: true }).first().click()
    expect(await row().locator('[data-testid="cell-date"]').innerText()).toBe('10/9/2026')
    expect(patches).toEqual([])
    expect(stored[0].date).toBe(originalDate)
  })

  it('rolls back click-away failure to the latest saved date in the same edit session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await mount()
    await selectDate()
    const response = page.waitForResponse(request => request.request().method() === 'PATCH')
    await row().locator('input[type="text"]').first().focus()
    await response
    await expect.poll(() => stored[0].date).toBe(selectedTimestamp)
    await page.waitForTimeout(100)
    failPatch = true
    await dateInput().fill('2026-11-01')
    await page.locator('#outside').click()
    await expect.poll(async () => row().locator('[data-testid="cell-date"]').getAttribute('class')).toContain('ring-red-400')
    expect(await row().locator('[data-testid="cell-date"]').innerText()).toBe('3/8/2026')
    expect(stored[0].date).toBe(selectedTimestamp)
    expect(patches).toHaveLength(2)
  })

  it('preserves the unmatched-payee exit guard and portal exclusion', async () => {
    await mount()
    await row().locator('[data-testid="cell-date"]').click()
    await row().getByRole('textbox', { name: 'Select or create payee' }).fill('Synthetic new payee')
    await page.waitForSelector('[data-portal-dropdown]')
    await page.locator('[data-portal-dropdown]').first().dispatchEvent('mousedown')
    expect(await row().getByRole('button', { name: 'Done', exact: true }).count()).toBe(2)
    await dateInput().fill(selectedDate)
    await row().getByRole('button', { name: 'Done', exact: true }).first().click()
    await page.waitForSelector('[data-portal-dropdown] button')
    expect(await row().getByRole('button', { name: 'Done', exact: true }).count()).toBe(2)
    expect(patches).toHaveLength(0)
    await page.getByRole('button', { name: 'Discard' }).click()
    await expect.poll(() => stored[0].date).toBe(selectedTimestamp)
    expect(patches).toHaveLength(1)
  })

  it.each(['UTC', 'America/Los_Angeles', 'Pacific/Auckland'])('abandons the date draft after delayed search removes its row in %s', async timezone => {
    searchGate = new Promise(resolve => { releaseSearch = resolve })
    await mount(timezone)
    const search = page.getByTestId('transaction-search')
    const request = page.waitForRequest(request => new URL(request.url()).searchParams.get('search') === 'no-match')
    await search.fill('no-match')
    await request
    await selectDate()
    releaseSearch!()
    await row().waitFor({ state: 'hidden' })
    await search.click()
    await search.fill('')
    await row().waitFor()
    await row().locator('[data-testid="cell-date"]').click()
    expect(await dateInput().inputValue()).toBe(originalDate.slice(0, 10))
    await row().getByRole('button', { name: 'Done', exact: true }).first().click()
    await page.waitForTimeout(100)
    expect(patches).toEqual([])
    expect(stored[0].date).toBe(originalDate)
  })

  it.each(['UTC', 'America/Los_Angeles', 'Pacific/Auckland'])('resets the visible date after a failed blur PATCH before Done in %s', async timezone => {
    failPatch = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await mount(timezone)
    await selectDate()
    const response = page.waitForResponse(response => response.request().method() === 'PATCH')
    await row().locator('input[type="text"]').first().focus()
    expect((await response).status()).toBe(500)
    await expect.poll(async () => dateInput().inputValue()).toBe(originalDate.slice(0, 10))
    expect(await row().locator('input[type="text"]').first().evaluate(input => input === document.activeElement)).toBe(true)
    failPatch = false
    await row().getByRole('button', { name: 'Done', exact: true }).first().click()
    expect(await row().locator('[data-testid="cell-date"]').innerText()).toBe('10/9/2026')
    expect(patches).toEqual([{ id: 'synthetic-row', body: { date: selectedTimestamp } }])
    expect(stored[0].date).toBe(originalDate)
    await row().locator('[data-testid="cell-date"]').click()
    await dateInput().fill(selectedDate)
    await row().getByRole('button', { name: 'Done', exact: true }).first().click()
    await expect.poll(() => stored[0].date).toBe(selectedTimestamp)
    expect(patches).toHaveLength(2)
  })

  it.each(['UTC', 'America/Los_Angeles', 'Pacific/Auckland'])('does not persist an Escape-cancelled date when the payee guard blocks exit in %s', async timezone => {
    await mount(timezone)
    await row().locator('[data-testid="cell-date"]').click()
    await row().getByRole('textbox', { name: 'Select or create payee' }).fill('Synthetic new payee')
    await dateInput().fill(selectedDate)
    await dateInput().press('Escape')
    await page.getByRole('button', { name: 'Discard', exact: true }).waitFor()
    expect(await row().getByRole('button', { name: 'Done', exact: true }).count()).toBe(2)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Discard', exact: true }).waitFor({ state: 'hidden' })
    await row().locator('input[type="text"]').first().focus()
    await page.waitForTimeout(100)
    expect(patches).toEqual([])
    expect(await dateInput().inputValue()).toBe(originalDate.slice(0, 10))
    expect(stored[0].date).toBe(originalDate)
  })

  it('discards a newer unsaved date draft consistently when a delayed blur PATCH rolls back', async () => {
    failPatch = true
    patchGate = new Promise(resolve => { releasePatch = resolve })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await mount()
    await selectDate()
    const response = page.waitForResponse(response => response.request().method() === 'PATCH')
    await row().locator('input[type="text"]').first().focus()
    await expect.poll(() => patches.length).toBe(1)
    await dateInput().fill('2026-11-01')
    releasePatch!()
    expect((await response).status()).toBe(500)
    await expect.poll(async () => dateInput().inputValue()).toBe(originalDate.slice(0, 10))
    failPatch = false
    await row().getByRole('button', { name: 'Done', exact: true }).first().click()
    await page.waitForTimeout(100)
    expect(patches).toHaveLength(1)
    expect(stored[0].date).toBe(originalDate)
    expect(await row().locator('[data-testid="cell-date"]').innerText()).toBe('10/9/2026')
  })

  it('starts a fresh date session without erasing a same-row active draft', async () => {
    await mount()
    await page.evaluate("window.fixtureMount('hook')")
    await page.waitForSelector('#hook-date')
    await page.evaluate(`window.fixtureEdit.dateDraftRef.current = { rowId: 'synthetic-row', value: '${selectedDate}' }; window.fixtureEdit.startEdit('synthetic-row', 'date')`)
    expect(await page.evaluate('window.fixtureEdit.dateDraftRef.current')).toBeNull()
    await page.evaluate(`window.fixtureEdit.dateDraftRef.current = { rowId: 'synthetic-row', value: '${selectedDate}' }; window.fixtureEdit.startEdit('synthetic-row', 'notes')`)
    expect(await page.evaluate('window.fixtureEdit.dateDraftRef.current')).toEqual({ rowId: 'synthetic-row', value: selectedDate })
    expect(patches).toEqual([])
  })

  it('ends the date session when the editing row disappears without an exit event', async () => {
    await mount()
    await page.evaluate("window.fixtureMount('hook')")
    await page.waitForSelector('#hook-date')
    await page.evaluate("window.fixtureEdit.startEdit('synthetic-row', 'date')")
    await expect.poll(() => page.evaluate('window.fixtureEdit.editingRowId')).toBe('synthetic-row')
    await page.evaluate(`window.fixtureEdit.dateDraftRef.current = { rowId: 'synthetic-row', value: '${selectedDate}' }; window.fixtureSetRows([])`)
    await expect.poll(() => page.evaluate('window.fixtureEdit.editingRowId')).toBeNull()
    expect(await page.evaluate('window.fixtureEdit.dateDraftRef.current')).toBeNull()
    expect(patches).toEqual([])
  })

  it.each(['synthetic-row', 'synthetic-other'])('a missing-row commit clears only its own date draft (%s)', async draftRowId => {
    await mount()
    await page.evaluate("window.fixtureMount('hook')")
    await page.waitForSelector('#hook-date')
    await page.evaluate('window.fixtureSetRows([])')
    await expect.poll(async () => page.locator('#hook-date').innerText()).toBe('missing')
    await page.evaluate(`window.fixtureEdit.dateDraftRef.current = { rowId: '${draftRowId}', value: '${selectedDate}' }; window.fixtureCommitDate('${selectedDate}')`)
    expect(await page.evaluate('window.fixtureEdit.dateDraftRef.current')).toEqual(draftRowId === 'synthetic-row' ? null : { rowId: draftRowId, value: selectedDate })
    expect(patches).toEqual([])
  })
})
