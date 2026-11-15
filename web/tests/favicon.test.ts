import { describe, expect, test } from 'vitest'
import indexHtml from '../index.html?raw'
import faviconSvg from '../public/favicon.svg?raw'

describe('favicon', () => {
  test('index.html links the app icon as a local file', () => {
    expect(indexHtml).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
    expect(indexHtml).not.toContain('data:,')
    for (const href of indexHtml.matchAll(/<link[^>]*href="([^"]*)"/g)) {
      expect(href[1]).toMatch(/^\/[^/]/) // a path on this server, never another host
    }
  })

  test('the icon is the sage rounded square with a white tick, with no external references', () => {
    expect(faviconSvg).toContain('#7fb069')
    expect(faviconSvg).toMatch(/stroke="#fff"/)
    expect(faviconSvg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/)
  })
})
