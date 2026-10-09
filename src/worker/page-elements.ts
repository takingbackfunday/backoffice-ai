import type { Frame, Locator, Page } from 'playwright-core'
import { redactDigits } from '@/lib/bank-import/redact'

export interface PageElement {
  id: number
  frameIndex: number
  tag: string
  role?: string
  type?: string
  text: string
  ariaLabel?: string
  placeholder?: string
  href?: string
  name?: string
  value?: string
  options?: string[]
  checked?: boolean
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

export function isCsvSelected(snapshot: Pick<PageSnapshot, 'elements'>): boolean {
  return snapshot.elements.some((element) =>
    element.tag === 'select' ? /\bcsv\b/i.test(element.value ?? '') :
      element.tag === 'input' && element.type === 'radio' && element.checked === true &&
      /\bcsv\b/i.test(`${element.text} ${element.ariaLabel ?? ''}`),
  )
}

export async function snapshotPage(page: Page, onFrameError?: (error: unknown) => void): Promise<PageSnapshot> {
  const elements: PageElement[] = []
  const frames: Frame[] = page.frames().slice(0, 6)
  let snapshotFailureCount = 0
  for (const [frameIndex, frame] of frames.entries()) {
    if (frame.isDetached() || frame.url() === 'about:blank') continue
    try {
      const collected = await frame.evaluate(({ startId, max }) => {
        const selector = 'a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=checkbox],[role=radio],summary,[onclick]'
        const found: Element[] = []
        const seen = new Set<Element>()
        const roots: (Document | ShadowRoot | Element)[] = [document]
        while (roots.length > 0) {
          const root = roots.pop()!
          root.querySelectorAll(selector).forEach((element) => {
            if (!seen.has(element)) { seen.add(element); found.push(element) }
            if (element.shadowRoot) roots.push(element.shadowRoot)
          })
        }
        const result: Omit<PageElement, 'id' | 'frameIndex'>[] = []
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
          const text = ((el.innerText ?? '').trim() || associatedLabel.trim()).replace(/\s+/g, ' ').slice(0, 100)
          const value = tag === 'input' && ['date', 'text', 'search'].includes(type ?? '')
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
            ariaLabel: el.getAttribute('aria-label') ?? undefined,
            placeholder: el.getAttribute('placeholder') ?? undefined,
            href: el.getAttribute('href')?.slice(0, 200),
            name: el.getAttribute('name')?.slice(0, 80) ?? undefined,
            value,
            options,
            checked: tag === 'input' && ['radio', 'checkbox'].includes(type ?? '') ? (el as HTMLInputElement).checked : undefined,
            disabled: (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true',
          })
        }
        return result
      }, { startId: elements.length, max: MAX_ELEMENTS - elements.length })
      const startId = elements.length
      collected.forEach((element, index) => elements.push({ ...element, id: startId + index, frameIndex }))
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
      return frame ? frame.locator(`[data-bi-idx="${id}"]`).first() : null
    },
  }
}
