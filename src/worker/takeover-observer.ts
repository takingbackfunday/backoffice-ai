import { randomUUID } from 'node:crypto'
import type { BrowserContext, Frame, Page } from 'playwright-core'
import type { BankConfig } from '@/lib/bank-import/banks'
import { isIsoDate } from '@/lib/bank-import/date-range'
import { isHostAllowed, isPathDenied } from '@/lib/bank-import/guardrails'
import { expectedPostcondition, parsePlaybook, PLAYBOOK_VERSION, type PlaybookIntent, type PlaybookStep, type PlaybookTarget } from '@/lib/bank-import/playbook'
import { detectAuthState } from './auth-detect'

export interface TakeoverObserver {
  start(page: Page): Promise<void>
  // valid describes the continuous observed segment, not route/CSV completion.
  stop(): Promise<{ steps: PlaybookStep[]; valid: boolean; downloadObserved: boolean }>
  invalidate(): void
  dispose(): Promise<void>
}

type Evidence = { bad: boolean; menu: boolean; controls: number; account: boolean; fromCount: number; toCount: number; csvCount: number; from: boolean; to: boolean; csv: boolean; directCsv: boolean }
type Signal = { segment: number; intent: PlaybookIntent | 'reject'; target?: PlaybookTarget; directCsv: boolean; at: number; accountMatched: boolean; exportReady: boolean }
type Runtime = { arm(segment: number, at: number): void; disable(): Promise<void>; destroy(): void; read(): Evidence }
type Settings = { key: string; binding: string; from: string; to: string; accountName: string; accountHint?: string; format: BankConfig['dateFormat'] }

// This function runs entirely in the browser. No labels, values, or URLs cross the binding.
async function install(settings: Settings) {
  const store = window as unknown as Record<string, Runtime>
  const waiting = await (window as unknown as Record<string, (data: unknown) => Promise<number | null>>)[settings.binding]({ initialize: true })
  if (waiting === null) return
  if (store[settings.key]) return
  let segment = 0, pendingSegment = waiting, clock = 0, clockAt = 0
  const callbacks = new Set<Promise<void>>()
  const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')
  const sensitive = /username|user name|login|logon|sign.?in|email|e-mail|password|passwort|otp|one[ -]time|mfa|verification|security code|benutzer|authenticat|pin\b|pay\b|transfer|zelle|wire|settings|sign out|logout|abmelden/i
  const selector = 'a[href],button,input,select,textarea,label,summary,[onclick],[contenteditable="true"],[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="radio"],[role="option"],[role="checkbox"],[role="combobox"],[role="textbox"],[role="switch"],[role="slider"]'
  const labels = (el: Element) => [...new Set([
    el.getAttribute('aria-label') ?? '',
    ...(el.getAttribute('aria-labelledby') ?? '').split(/\s+/).map(id => (el.getRootNode() as Document | ShadowRoot).getElementById(id)?.textContent ?? ''),
    ...Array.from((el as HTMLInputElement).labels ?? []).map(label => label.textContent ?? ''),
    el.matches('input,select,textarea,[contenteditable],[role="textbox"]') ? '' : (el as HTMLElement).innerText ?? el.textContent ?? '',
  ].map(text => normalize(text.slice(0, 200))).filter(Boolean))]
  const account = (text: string) => {
    const words = (value: string) => normalize(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    const hint = words(settings.accountHint || settings.accountName)
    return !!hint && !sensitive.test(text) && (` ${words(text)} `).includes(` ${hint} `)
  }
  const cue = (text: string): [PlaybookIntent, PlaybookTarget?] | undefined => {
    if (sensitive.test(text)) return
    if (text === 'menu') return ['open_navigation_menu', 'menu']
    if (['more', 'more options', 'more...', 'more options...', 'more\u2026', 'more options\u2026'].includes(text)) return ['open_navigation_menu', 'more']
    if (text === 'account services') return ['open_navigation_menu', 'account_services']
    if (['statements and documents', 'statements & documents', 'downloads'].includes(text)) return ['open_export_options', 'statements_documents']
    if (['download account activity', 'download transactions', 'download activity'].includes(text)) return ['open_export_options', 'download_activity']
    if (text === 'export') return ['open_export_options', 'export']
    if (['custom range', 'custom date range', 'choose a date range', 'choose date range'].includes(text)) return ['choose_date_range', 'custom_range']
    if (['account activity', 'transaction activity', 'transactions', 'activity', 'ums\u00e4tze'].includes(text)) return ['open_transaction_activity']
    if (['csv', 'csv format', 'spreadsheet (csv)'].includes(text)) return ['select_csv']
    if (['download', 'download csv'].includes(text)) return ['download_csv', 'export']
    if (account(text)) return ['open_selected_account']
  }
  const classify = (el: Element) => {
    const candidates = labels(el).map(cue)
    if (candidates.some(c => !c || JSON.stringify(c) !== JSON.stringify(candidates[0]))) return
    return candidates[0]
  }
  const visible = (el: Element): boolean => {
    const rect = el.getBoundingClientRect(), style = getComputedStyle(el)
    return !!rect.width && !!rect.height && style.visibility !== 'hidden' && style.display !== 'none'
  }
  const dateSide = (el: Element) => {
    if (!(el instanceof HTMLInputElement) || !['date', 'text'].includes(el.type)) return
    const hints = `${labels(el).join(' ')} ${el.getAttribute('placeholder') ?? ''}`.toLowerCase()
    if (sensitive.test(`${hints} ${el.id} ${el.name} ${el.autocomplete}`)) return
    if (el.type !== 'date' && !/\b(date|datum)\b|(?:dd|tt|mm|yyyy|jjjj)\s*[./-]\s*(?:dd|tt|mm|yyyy|jjjj)/i.test(hints)) return
    const from = /\b(from|start|since|von|beginn)\b/.test(hints), to = /\b(to|end|through|until|bis|ende)\b/.test(hints)
    return from !== to ? (from ? 'from' : 'to') : undefined
  }
  const matchesDate = (el: HTMLInputElement, side: 'from' | 'to') => {
    const hints = `${labels(el).join(' ')} ${el.placeholder}`.toUpperCase().replace(/\s/g, '')
    if (el.type !== 'date' && [hints.includes('YYYY-MM-DD'), /DD\/MM\/|TT\/MM\//.test(hints), /MM\/DD\//.test(hints), /(?:DD|TT)\.MM\./.test(hints)].filter(Boolean).length > 1) return false
    const format = el.type === 'date' || hints.includes('YYYY-MM-DD') ? 'ISO' :
      /DD\/MM\/|TT\/MM\//.test(hints) ? 'DD/MM/YYYY' : /MM\/DD\//.test(hints) ? 'MM/DD/YYYY' :
      /(?:DD|TT)\.MM\./.test(hints) ? 'DD.MM.YYYY' : settings.format
    // Read only recognized date controls, and immediately reduce their value to a comparison.
    const parts = el.value.trim().match(format === 'ISO' ? /^(\d{4})-(\d{2})-(\d{2})$/ : format === 'DD.MM.YYYY' ? /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/ : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    return !!parts && (format === 'ISO' ? `${parts[1]}-${parts[2]}-${parts[3]}` : `${parts[3]}-${(format === 'MM/DD/YYYY' ? parts[1] : parts[2]).padStart(2, '0')}-${(format === 'MM/DD/YYYY' ? parts[2] : parts[1]).padStart(2, '0')}`) === settings[side]
  }
  const selected = (el: Element) => el instanceof HTMLInputElement ? el.checked : el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true'
  const read = (): Evidence => {
    const result: Evidence = { bad: false, menu: false, controls: 0, account: false, fromCount: 0, toCount: 0, csvCount: 0, from: false, to: false, csv: false, directCsv: false }
    const roots: (Document | ShadowRoot)[] = [document]
    let scanned = 0, controls = 0
    for (let i = 0; i < roots.length; i++) {
      const walker = document.createTreeWalker(roots[i], NodeFilter.SHOW_ELEMENT)
      let el: Element | null
      while ((el = walker.nextNode() as Element | null)) {
        if (++scanned > 5000) { result.bad = true; return result }
        if (el.shadowRoot) { if (roots.length >= 32) { result.bad = true; return result }; roots.push(el.shadowRoot) }
        if (!visible(el) && !(el instanceof HTMLInputElement && Array.from(el.labels ?? []).some(visible))) continue
        if (el.matches('h1,h2,[role="heading"]')) result.account ||= labels(el).some(account)
        result.menu ||= el.getAttribute('role') === 'menu'
        if (!el.matches(selector) || el.matches('label')) continue
        if (++controls > 250) { result.bad = true; return result }
        if (el.matches('input,textarea') && (el.getAttribute('type') === 'password' || sensitive.test(`${labels(el).join(' ')} ${el.getAttribute('name')} ${el.id} ${el.getAttribute('autocomplete')}`))) result.bad = true
        const semantic = classify(el)
        result.directCsv ||= semantic?.[0] === 'download_csv' && labels(el).includes('download csv')
        const targets = ['menu', 'more', 'account_services', 'statements_documents', 'download_activity', 'export', 'custom_range']
        if (semantic) result.controls |= 1 << (semantic[1] ? targets.indexOf(semantic[1]) : semantic[0] === 'select_csv' ? 7 : 8)
        result.menu ||= semantic?.[0] === 'open_navigation_menu' && el.getAttribute('aria-expanded') === 'true'
        const side = dateSide(el)
        if (side) { result[side === 'from' ? 'fromCount' : 'toCount']++; result[side] ||= matchesDate(el as HTMLInputElement, side); result.controls |= 1 << 9 }
        if (el instanceof HTMLSelectElement) {
          const options = Array.from(el.options).filter(option => cue(normalize(option.text))?.[0] === 'select_csv')
          result.csvCount += options.length ? 1 : 0
          result.bad ||= options.length > 1
          result.csv ||= options.some(option => option.selected)
        } else if (semantic?.[0] === 'select_csv' && el.matches('input[type="radio"],input[type="checkbox"],[role="radio"],[role="option"]')) {
          result.csvCount++; result.csv ||= selected(el)
        }
      }
    }
    result.bad ||= result.fromCount > 1 || result.toCount > 1 || result.csvCount > 1
    return result
  }
  const send = (signal: Omit<Signal, 'at' | 'accountMatched' | 'exportReady'> & Partial<Pick<Signal, 'accountMatched' | 'exportReady'>>) => {
    const callback = (window as unknown as Record<string, (data: Signal) => Promise<void>>)[settings.binding]({ accountMatched: false, exportReady: false, ...signal, at: Math.floor(clock + performance.now() - clockAt) }).catch(() => {})
    callbacks.add(callback); void callback.finally(() => callbacks.delete(callback))
  }
  const onEvent = (event: Event) => {
    if ((!segment && !pendingSegment) || !event.isTrusted) return
    const path = event.composedPath().filter(node => node instanceof Element) as Element[]
    let el = path.find(node => node.matches(selector))
    // A meaningful action before a new document is safely armed must not silently disappear.
    if (!segment) { if (el || path[0]?.tagName.includes('-')) send({ segment: pendingSegment, intent: 'reject', directCsv: false }); return }
    if (el instanceof HTMLLabelElement) {
      if (!el.control) { send({ segment, intent: 'reject', directCsv: false }); return }
      el = el.control
    }
    if (!el) { if (path[0]?.tagName.includes('-')) send({ segment, intent: 'reject', directCsv: false }); return }
    if (el instanceof HTMLOptionElement) el = el.closest('select') ?? undefined
    if (!el) { send({ segment, intent: 'reject', directCsv: false }); return }
    const side = dateSide(el)
    if (event.type === 'click' && side) return
    if (event.type === 'click' && el instanceof HTMLSelectElement && Array.from(el.options).some(option => ['select_csv', 'choose_date_range'].includes(cue(normalize(option.text))?.[0] ?? ''))) return
    let semantic = side && event.type === 'change' ? [side === 'from' ? 'set_date_from' : 'set_date_to'] as [PlaybookIntent] : classify(el)
    if (event.type === 'change' && el instanceof HTMLSelectElement) {
      const choices = Array.from(el.selectedOptions).map(option => cue(normalize(option.text)))
      semantic = choices.length === 1 && ['select_csv', 'choose_date_range'].includes(choices[0]?.[0] ?? '') ? choices[0] : undefined
    }
    if (event.type === 'change' && !side && semantic?.[0] !== 'select_csv' && semantic?.[0] !== 'choose_date_range') semantic = undefined
    if (semantic?.[0] === 'select_csv' && !el.matches('select,input[type="radio"],input[type="checkbox"],[role="radio"],[role="option"]')) semantic = undefined
    const before = read()
    if (semantic?.[0] === 'open_export_options' && semantic[1] === 'export' && before.fromCount && before.toCount) semantic = ['download_csv', 'export']
    const directCsv = labels(el).includes('download csv')
    send({ segment, intent: before.bad ? 'reject' : semantic?.[0] ?? 'reject', ...(semantic?.[1] ? { target: semantic[1] } : {}), directCsv, accountMatched: semantic?.[0] === 'open_selected_account', exportReady: semantic?.[0] === 'download_csv' && before.from && before.to && (before.csv || directCsv) })
  }
  document.addEventListener('click', onEvent, true)
  document.addEventListener('change', onEvent, true)
  store[settings.key] = {
    arm(value, at) { segment = value; pendingSegment = 0; clock = at; clockAt = performance.now() },
    async disable() { segment = 0; pendingSegment = 0; await Promise.all(callbacks) }, read,
    destroy() { segment = 0; pendingSegment = 0; callbacks.clear(); document.removeEventListener('click', onEvent, true); document.removeEventListener('change', onEvent, true); delete store[settings.key] },
  }
}

export async function createTakeoverObserver(args: { context: BrowserContext; bank: BankConfig; from: string; to: string; accountName: string; accountHint?: string }): Promise<TakeoverObserver> {
  const { context, bank } = args
  const key = `__takeover_${randomUUID().replace(/-/g, '')}`, binding = `${key}_signal`
  const settings: Settings = { key, binding, from: args.from, to: args.to, accountName: args.accountName, accountHint: args.accountHint, format: bank.dateFormat }
  let active = false, draining = false, disposed = false, valid = false, segment = 0, startedAt = 0, pending = 0, downloadObserved = false
  let steps: PlaybookStep[] = [], tail = Promise.resolve()
  let waitingDownload: { page: Page; at: number; resolve(): void } | undefined
  const pages = new Map<Page, { navigate: (frame: Frame) => void; download: () => void; close: () => void }>()
  const baselines = new Map<Page, number>(), downloads = new Map<Page, number[]>(), navigations = new Map<Page, number>()
  const invalidate = () => { valid = false }
  const bounded = async <T>(work: Promise<T>, ms = 1500): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('observer_timeout')), ms) })]) }
    finally { clearTimeout(timer) }
  }
  const allowed = (url: string) => {
    try {
      const decoded = decodeURIComponent(url)
      const parsed = new URL(url)
      return !parsed.username && !parsed.password && isHostAllowed(url, bank.allowedHostSuffixes, bank.allowInsecureLocalhost) && !isPathDenied(decoded) && !/[\/#._-](login|logon|sign-?in|mfa|otp|2fa|two-?factor|verify|verification|challenge|authenticat(?:e|ion))(?=[\/#?._-]|$)/i.test(decoded) && !bank.loginUrlPatterns.some(pattern => new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '')).test(url))
    } catch { return false }
  }
  const safe = async (page: Page, frame: Frame) => !page.isClosed() && !frame.isDetached() && frame.page() === page && page.frames().length <= 6 && page.frames().every(candidate => allowed(candidate.url())) && await detectAuthState(page, bank) === 'authenticated'
  const snapshot = async (page: Page): Promise<Evidence> => {
    const evidence = await Promise.all(page.frames().map(frame => frame.evaluate(key => (window as unknown as Record<string, Runtime>)[key].read(), key)))
    const result = evidence.reduce((a, b) => ({ bad: a.bad || b.bad, menu: a.menu || b.menu, controls: a.controls | b.controls, account: a.account || b.account, fromCount: a.fromCount + b.fromCount, toCount: a.toCount + b.toCount, csvCount: a.csvCount + b.csvCount, from: a.from || b.from, to: a.to || b.to, csv: a.csv || b.csv, directCsv: a.directCsv || b.directCsv }))
    result.bad ||= result.fromCount > 1 || result.toCount > 1 || result.csvCount > 1
    return result
  }
  const enqueue = (work: (epoch: number) => Promise<void>, timeout = 1500) => {
    const epoch = segment
    if (pending >= 50) { invalidate(); return }
    pending++
    tail = tail.then(async () => {
      if (disposed || epoch !== segment || !valid) return
      await bounded(work(epoch), timeout).catch(() => { if (epoch === segment && !disposed) invalidate() })
    }).finally(() => { if (epoch === segment) pending-- })
  }
  await context.exposeBinding(binding, (source, payload: unknown) => {
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length === 1 && (payload as { initialize?: unknown }).initialize === true) return disposed ? null : active ? segment : 0
    if ((!active && !draining) || disposed) return
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { invalidate(); return }
    const signal = payload as Signal
    const keys = Object.keys(payload)
    const step = signal.intent === 'reject' ? null : parsePlaybook(PLAYBOOK_VERSION, [{ intent: signal.intent, expected: expectedPostcondition(signal.intent), ...(signal.target === undefined ? {} : { target: signal.target }) }])?.[0]
    if (keys.some(k => !['segment', 'intent', 'target', 'directCsv', 'at', 'accountMatched', 'exportReady'].includes(k)) || signal.segment !== segment || typeof signal.directCsv !== 'boolean' || typeof signal.accountMatched !== 'boolean' || typeof signal.exportReady !== 'boolean' || !Number.isInteger(signal.at) || signal.at < startedAt || signal.at > Date.now() + 100 || (!step && signal.intent !== 'reject')) { invalidate(); return }
    if (signal.intent === 'reject') { invalidate(); return }
    // Copy only validated semantic fields; never retain an untrusted payload object.
    const { directCsv, at, accountMatched, exportReady } = signal
    const { page, frame } = source
    if (frame.isDetached() || !allowed(page.url()) || !allowed(frame.url())) { invalidate(); return }
    // Compare against the trusted click time, not binding arrival: CDP events can arrive first.
    const attributed = () => downloads.get(page)?.find(time => time >= at && time <= at + 5000)
    enqueue(async epoch => {
      if (step!.intent === 'download_csv' && !exportReady) { invalidate(); return }
      if (step!.intent === 'download_csv' && attributed() === undefined) {
        const waiter = { page, at, resolve: () => {} }
        try { await bounded(new Promise<void>(resolve => { waiter.resolve = resolve; waitingDownload = waiter }), Math.max(1, Math.min(5000, at + 5000 - Date.now()))) }
        finally { if (waitingDownload === waiter) waitingDownload = undefined }
      }
      if (disposed || epoch !== segment || !valid) return
      await new Promise(resolve => setTimeout(resolve, 100))
      const authenticated = await safe(page, frame)
      if (disposed || epoch !== segment || !valid) return
      if (!authenticated) { invalidate(); return }
      const fresh = await snapshot(page)
      if (disposed || epoch !== segment || !valid) return
      const before = baselines.get(page)
      const route = new URL(page.url()), path = `${route.pathname}/${route.hash}`
      const changed = before !== undefined && (fresh.controls & ~before) !== 0
      const supported = step!.intent === 'open_navigation_menu' ? fresh.menu || changed :
        step!.intent === 'open_selected_account' ? fresh.account || accountMatched && (navigations.get(page) ?? 0) >= at && /\/(?:accounts?|account-details|activity|transactions)(?:\/|#|$)/i.test(path) :
        step!.intent === 'open_transaction_activity' ? /(?:^|[/#-])(activity|transactions|feed)(?:[/#?_-]|$)/i.test(path) || fresh.account && (fresh.controls & (1 << 4)) !== 0 :
        step!.intent === 'open_export_options' ? fresh.fromCount > 0 && fresh.toCount > 0 || fresh.csvCount > 0 || (fresh.controls & ((1 << 4) | (1 << 5))) !== 0 && changed :
        step!.intent === 'choose_date_range' ? fresh.fromCount === 1 && fresh.toCount === 1 :
        step!.intent === 'select_csv' ? fresh.csv : step!.intent === 'set_date_from' ? fresh.from :
        step!.intent === 'set_date_to' ? fresh.to : exportReady && fresh.from && fresh.to && (fresh.csv || directCsv && fresh.directCsv) && attributed() !== undefined
      if (disposed || epoch !== segment || !valid) return
      if (fresh.bad || !supported) { invalidate(); return }
      if (step!.intent === 'download_csv') downloads.set(page, (downloads.get(page) ?? []).filter(time => time !== attributed()))
      baselines.set(page, fresh.controls)
      const previous = steps.at(-1)
      if (previous?.intent !== step!.intent || previous?.target !== step!.target) {
        if (steps.length >= 25) invalidate()
        else steps.push(step!)
      }
    }, step!.intent === 'download_csv' ? 6000 : 1500)
  })
  const initialize = async (frame: Frame, arm: boolean, epoch = segment) => {
    await frame.evaluate(install, settings)
    if (arm) {
      if (!await safe(frame.page(), frame)) { if (epoch === segment) invalidate(); return }
      const fresh = await snapshot(frame.page())
      if (fresh.bad) { if (epoch === segment) invalidate(); return }
      if (active && valid && !disposed && epoch === segment) {
        baselines.set(frame.page(), fresh.controls)
        await frame.evaluate(({ key, segment, at }) => (window as unknown as Record<string, Runtime>)[key].arm(segment, at), { key, segment: epoch, at: Date.now() })
      }
    }
  }
  const attach = (page: Page) => {
    if (disposed || pages.has(page)) return
    const listeners = {
      navigate: (frame: Frame) => {
        if (disposed) return
        if (active && frame === page.mainFrame()) navigations.set(page, Date.now())
        if (active && frame.url() !== 'about:blank' && (!allowed(frame.url()) || !allowed(page.url()))) { invalidate(); return }
        if (active && frame.url() !== 'about:blank') enqueue(async epoch => { await initialize(frame, true, epoch) })
        else void bounded(initialize(frame, false)).catch(() => {})
      },
      download: () => {
        if (!disposed && (active || draining || pending > 0)) {
          const at = Date.now()
          downloadObserved = true; downloads.set(page, [...(downloads.get(page) ?? []).filter(time => time >= at - 8000), at].slice(-50))
          if (waitingDownload?.page === page && at >= waitingDownload.at && at <= waitingDownload.at + 5000) waitingDownload.resolve()
        }
      },
      close: () => { if (active && !disposed) invalidate() },
    }
    pages.set(page, listeners)
    page.on('framenavigated', listeners.navigate).on('download', listeners.download).on('close', listeners.close)
    if (active) for (const frame of page.frames()) if (frame.url() !== 'about:blank') enqueue(async epoch => { await initialize(frame, true, epoch) })
  }
  context.on('page', attach)
  // Context-lifetime init scripts/bindings cannot be removed; the bootstrap refuses work after dispose.
  await context.addInitScript(install, settings)
  for (const page of context.pages()) { attach(page); await Promise.all(page.frames().map(frame => bounded(initialize(frame, false)).catch(() => {}))) }
  const disable = async (destroy = false) => {
    await Promise.all(context.pages().flatMap(page => page.frames().map(frame => bounded(frame.evaluate(async ({ key, destroy }) => {
      const runtime = (window as unknown as Record<string, Runtime>)[key]
      if (destroy) runtime?.destroy(); else await runtime?.disable()
    }, { key, destroy })).catch(invalidate))))
  }
  return {
    async start(page) {
      if (disposed) return
      waitingDownload?.resolve(); waitingDownload = undefined
      active = false; draining = false; segment++; startedAt = Date.now(); pending = 0; steps = []; downloadObserved = false; valid = false; tail = Promise.resolve(); baselines.clear(); downloads.clear(); navigations.clear()
      await disable()
      try {
        if (!isIsoDate(args.from) || !isIsoDate(args.to) || args.from > args.to || page.context() !== context || !await bounded(safe(page, page.mainFrame()))) return
        valid = true; active = true
        await bounded(Promise.all(page.frames().map(frame => initialize(frame, true))))
      } catch { invalidate() }
    },
    async stop() {
      active = false; draining = !disposed
      await disable()
      draining = false
      await bounded(tail, 8000).catch(() => { invalidate(); segment++; pending = 0; waitingDownload?.resolve(); waitingDownload = undefined })
      if (valid) await bounded(Promise.all([...baselines.keys()].map(async page => {
        if (!await safe(page, page.mainFrame()) || (await snapshot(page)).bad) invalidate()
      }))).catch(invalidate)
      return { steps: steps.map(step => ({ ...step })), valid, downloadObserved }
    },
    invalidate,
    async dispose() {
      if (disposed) return
      active = false; draining = false; disposed = true; valid = false; segment++
      waitingDownload?.resolve(); waitingDownload = undefined
      context.off('page', attach)
      for (const [page, listeners] of pages) page.off('framenavigated', listeners.navigate).off('download', listeners.download).off('close', listeners.close)
      await disable(true)
      pages.clear(); baselines.clear(); downloads.clear(); navigations.clear(); steps = []; pending = 0; downloadObserved = false
    },
  }
}
