import { describe, expect, it } from 'vitest'
import { embeddableLiveViewUrl } from './live-view-url'

describe('embeddableLiveViewUrl', () => {
  it.each(['cloud.browser-use.com', 'cloud.eu.browser-use.com'])('converts %s dashboard views without changing connection credentials', (host) => {
    const connection = 'wss://browser.eu.browser-use.com/devtools/browser/test?token=fake-token&region=eu'
    const original = new URL(`https://${host}/live`)
    original.searchParams.set('wss', connection)
    original.searchParams.set('ui', 'false')

    const result = new URL(embeddableLiveViewUrl(original.toString())!)
    expect(result.origin).toBe('https://live.browser-use.com')
    expect(result.pathname).toBe('/')
    expect(result.searchParams.get('wss')).toBe(connection)
    expect(result.searchParams.get('ui')).toBe('false')
  })

  it('preserves standalone viewer URLs', () => {
    const url = 'https://live.browser-use.com/?wss=wss%3A%2F%2Fbrowser.eu.browser-use.com%2Ftest'
    expect(embeddableLiveViewUrl(url)).toBe(url)
  })

  it.each([
    'not a url',
    'http://cloud.eu.browser-use.com/live?wss=wss://browser.eu.browser-use.com/test',
    'https://cloud.eu.browser-use.com.evil.test/live?wss=wss://browser.eu.browser-use.com/test',
    'https://cloud.eu.browser-use.com:444/live?wss=wss://browser.eu.browser-use.com/test',
    'https://user:password@cloud.eu.browser-use.com/live?wss=wss://browser.eu.browser-use.com/test',
    'https://cloud.eu.browser-use.com/dashboard?wss=wss://browser.eu.browser-use.com/test',
    'https://cloud.eu.browser-use.com/live',
    'https://cloud.eu.browser-use.com/live?wss=',
    'https://cloud.eu.browser-use.com/live?wss=invalid',
    'https://cloud.eu.browser-use.com/live?wss=javascript:alert(1)',
    'https://cloud.eu.browser-use.com/live?wss=ws://browser.eu.browser-use.com/test',
    'https://cloud.eu.browser-use.com/live?wss=wss://user:password@browser.eu.browser-use.com/test',
    'https://cloud.eu.browser-use.com/live?wss=wss://browser.eu.browser-use.com/a&wss=wss://browser.eu.browser-use.com/b',
  ])('rejects unsupported or unsafe URLs', (url) => {
    expect(embeddableLiveViewUrl(url)).toBeNull()
  })
})
