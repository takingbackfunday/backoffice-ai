import type { Frame, Locator, Page } from 'playwright-core'
import { redactDigits } from '@/lib/bank-import/redact'
import { inferBankDateFormat, parseBankDate } from '@/lib/bank-import/date-range'
import type { BankConfig } from '@/lib/bank-import/banks'

export interface PageElement {
  id: number
  frameIndex: number
  frameId?: number
  tag: string
  role?: string
  type?: string
  text: string
  ariaLabel?: string
  placeholder?: string
  href?: string
  name?: string
  value?: string
  domId?: string
  options?: string[]
  checked?: boolean
  readOnly?: boolean
  disabled: boolean
}

export interface PageSnapshot {
  url: string
  title: string
  textExcerpt: string
  elements: PageElement[]
  frameCount: number
  snapshotFailureCount: number
  locate(id: number): Locator | null
}

export const MAX_ELEMENTS = 250
const frameIds = new WeakMap<Frame, number>()
let nextFrameId = 0

export interface DateInputIdentity { domId: string; frameId: number }

export function isCsvSelected(snapshot: Pick<PageSnapshot, 'elements'>): boolean {
  return snapshot.elements.some((element) =>
    element.tag === 'select' ? /\bcsv\b/i.test(element.value ?? '') :
      ((element.tag === 'input' && element.type === 'radio') || element.role === 'radio' || element.role === 'option') && element.checked === true &&
      /\bcsv\b/i.test(`${element.text} ${element.ariaLabel ?? ''}`),
  )
}

export function matchesDateRange(snapshot: Pick<PageSnapshot, 'elements'>, bank: BankConfig, from: string, to: string, inputIds: Partial<Record<'from' | 'to', DateInputIdentity>> = {}): boolean {
  const dates: Record<'from' | 'to', string[]> = { from: [], to: [] }
  for (const element of snapshot.elements) {
    if (element.tag !== 'input' || !['date', 'text'].includes(element.type ?? '') || element.value === undefined) continue
    const hint = `${element.text} ${element.ariaLabel ?? ''} ${element.name ?? ''} ${element.placeholder ?? ''}`
    const start = inputIds.from ? element.domId === inputIds.from.domId && element.frameId === inputIds.from.frameId : /\b(from|start|since|von)\b/i.test(hint)
    const end = inputIds.to ? element.domId === inputIds.to.domId && element.frameId === inputIds.to.frameId : /\b(to|through|end|until|bis)\b/i.test(hint)
    if (start === end) continue
    const format = element.type === 'date' ? 'ISO' as const : inferBankDateFormat(hint) ?? bank.dateFormat
    dates[start ? 'from' : 'to'].push(parseBankDate(element.value, format) ?? '')
  }
  return dates.from.length === 1 && dates.to.length === 1 && dates.from[0] === from && dates.to[0] === to
}

export async function snapshotPage(page: Page, onFrameError?: (error: unknown) => void): Promise<PageSnapshot> {
  const elements: PageElement[] = []
  const frames: Frame[] = page.frames().slice(0, 6)
  let snapshotFailureCount = 0
  for (const [frameIndex, frame] of frames.entries()) {
    if (frame.isDetached() || frame.url() === 'about:blank') continue
    try {
      const collected = await frame.evaluate(({ startId, max }) => {
        const selector = 'a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=checkbox],[role=radio],[role=gridcell],summary,[onclick]'
        const found: Element[] = []
        const roots: (Document | ShadowRoot)[] = [document]
        let scanned = 0
        // Shadow hosts need not be interactive themselves.
        for (let i = 0; i < roots.length && scanned < 5000; i++) {
          const walker = document.createTreeWalker(roots[i], NodeFilter.SHOW_ELEMENT)
          let element: Element | null
          while (scanned < 5000 && (element = walker.nextNode() as Element | null)) {
            scanned++
            if (element.shadowRoot && roots.length < 32) roots.push(element.shadowRoot)
            if (element.matches(selector)) found.push(element)
          }
        }
        const result: Omit<PageElement, 'id' | 'frameIndex' | 'frameId'>[] = []
        for (const element of found) {
          if (result.length >= max) break
          const el = element as HTMLElement
          const style = getComputedStyle(el)
          const rect = el.getBoundingClientRect()
          if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none') continue
          const tag = el.tagName.toLowerCase()
          const type = tag === 'input' ? (el as HTMLInputElement).type : el.getAttribute('type') ?? undefined
          if (tag === 'input' && (type === 'password' || type === 'hidden')) continue
          const id = startId + result.length
          el.setAttribute('data-bi-idx', String(id))
          const associatedLabel = tag === 'input'
            ? (el as HTMLInputElement).labels?.[0]?.innerText ?? el.closest('label')?.innerText ?? ''
            : ''
          const placeholder = el.getAttribute('placeholder') ?? undefined
          const labelledBy = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/)
            .map((id) => (el.getRootNode() as Document | ShadowRoot).getElementById(id)?.textContent ?? '').join(' ')
          const ariaLabel = el.getAttribute('aria-label') ?? (labelledBy.trim() || undefined)
          const text = ((el.innerText ?? '').trim() || associatedLabel.trim() || labelledBy.trim()).replace(/\s+/g, ' ').slice(0, 100)
          const dateHints = `${associatedLabel} ${ariaLabel ?? ''} ${labelledBy} ${placeholder ?? ''}`
          const dateLabelled = /\b(date|datum)\b|\b(?:dd|tt|mm|yyyy|jjjj)\s*[./-]\s*(?:dd|tt|mm|yyyy|jjjj)\s*[./-]\s*(?:dd|tt|mm|yyyy|jjjj)\b/i.test(dateHints)
          const sensitive = /username|user name|login|email|e-mail|password|otp|one[ -]time|verification|security code|benutzer|passwort/i.test(
            `${dateHints} ${el.getAttribute('name') ?? ''} ${el.getAttribute('id') ?? ''} ${el.getAttribute('autocomplete') ?? ''}`,
          )
          const value = tag === 'input' && !sensitive && (type === 'date' || (['text', 'search'].includes(type ?? '') && dateLabelled))
            ? (el as HTMLInputElement).value.slice(0, 12)
            : tag === 'select' ? (el as HTMLSelectElement).selectedOptions[0]?.text.slice(0, 80)
            : undefined
          const options = tag === 'select'
            ? Array.from((el as HTMLSelectElement).options).slice(0, 30).map((option) => option.text.trim().slice(0, 80))
            : undefined
          result.push({
            tag,
            role: el.getAttribute('role') ?? undefined,
            type,
            text,
            ariaLabel,
            placeholder,
            href: el.getAttribute('href')?.slice(0, 200),
            name: el.getAttribute('name')?.slice(0, 80) ?? undefined,
            value,
            domId: tag === 'input' && value !== undefined && el.id.length <= 200 ? el.id || undefined : undefined,
            options,
            checked: tag === 'input' && ['radio', 'checkbox'].includes(type ?? '') ? (el as HTMLInputElement).checked
              : el.hasAttribute('aria-checked') ? el.getAttribute('aria-checked') === 'true'
              : el.hasAttribute('aria-selected') ? el.getAttribute('aria-selected') === 'true' : undefined,
            readOnly: tag === 'input' ? (el as HTMLInputElement).readOnly : undefined,
            disabled: (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true',
          })
        }
        return result
      }, { startId: elements.length, max: MAX_ELEMENTS - elements.length })
      const startId = elements.length
      let frameId = frameIds.get(frame)
      if (frameId === undefined) { frameId = nextFrameId++; frameIds.set(frame, frameId) }
      collected.forEach((element, index) => elements.push({ ...element, id: startId + index, frameIndex, frameId }))
    } catch (error) {
      snapshotFailureCount++
      onFrameError?.(error)
      // Cross-origin and detached frames can disappear while a snapshot is collected.
    }
    if (elements.length >= MAX_ELEMENTS) break
  }
  const excerpt = await page.locator('body').innerText({ timeout: 1500 }).catch(() => '')
  const title = await page.title().catch(() => '')
  const framesByIndex = new Map(frames.map((frame, index) => [index, frame]))
  return {
    url: page.url(),
    title,
    textExcerpt: redactDigits(excerpt.replace(/\s+/g, ' ').slice(0, 1500)),
    frameCount: frames.length,
    snapshotFailureCount,
    elements: elements.map((element) => ({
      ...element,
      text: redactDigits(element.text),
      ariaLabel: element.ariaLabel ? redactDigits(element.ariaLabel) : undefined,
      placeholder: element.placeholder ? redactDigits(element.placeholder) : undefined,
      options: element.options?.map(redactDigits),
    })),
    locate(id) {
      const element = elements.find((candidate) => candidate.id === id)
      const frame = element && framesByIndex.get(element.frameIndex)
      if (frame && element.domId && elements.filter(candidate => candidate.frameIndex === element.frameIndex && candidate.domId === element.domId).length === 1) {
        // Calendar selection can replace inputs and discard our temporary data-bi-idx attribute.
        // Keep this locator strict: duplicate live IDs must fail rather than reading another input.
        return frame.locator(`input[id=${JSON.stringify(element.domId)}]:visible`)
      }
      return frame ? frame.locator(`[data-bi-idx="${id}"]`).first() : null
    },
  }
}
