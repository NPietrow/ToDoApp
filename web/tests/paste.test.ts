import '@testing-library/jest-dom/vitest'
import { describe, expect, test } from 'vitest'
import { plainPaste } from '../src/lib/paste'

function pasteEvent(data: Record<string, string>): ClipboardEvent {
  const e = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(e, 'clipboardData', { value: { getData: (t: string) => data[t] ?? '' } })
  return e
}

function setup(el: HTMLInputElement | HTMLTextAreaElement, opts?: { multiline?: boolean }) {
  document.body.append(el)
  const inputs: Event[] = []
  el.addEventListener('input', (e) => inputs.push(e))
  const action = plainPaste(el, opts)
  return { inputs, action }
}

describe('plainPaste', () => {
  test('inserts text/plain only, collapsed to one line, and prevents the default', () => {
    const el = document.createElement('input')
    const { inputs } = setup(el)
    const e = pasteEvent({ 'text/plain': 'a\r\n b', 'text/html': '<b>nope</b>' })
    el.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(el.value).toBe('a b')
    expect(inputs).toHaveLength(1)
  })

  test('inserts at the caret', () => {
    const el = document.createElement('input')
    setup(el)
    el.value = 'abef'
    el.setSelectionRange(2, 2)
    el.dispatchEvent(pasteEvent({ 'text/plain': 'cd' }))
    expect(el.value).toBe('abcdef')
    expect(el.selectionStart).toBe(4)
  })

  test('replaces a selection', () => {
    const el = document.createElement('input')
    setup(el)
    el.value = 'hello world'
    el.setSelectionRange(6, 11)
    el.dispatchEvent(pasteEvent({ 'text/plain': 'there' }))
    expect(el.value).toBe('hello there')
  })

  test('multiline keeps newlines and normalises CRLF', () => {
    const el = document.createElement('textarea')
    setup(el, { multiline: true })
    el.dispatchEvent(pasteEvent({ 'text/plain': 'one\r\ntwo\nthree' }))
    expect(el.value).toBe('one\ntwo\nthree')
  })

  test('with no text/plain it inserts nothing but still blocks rich content', () => {
    const el = document.createElement('input')
    const { inputs } = setup(el)
    const e = pasteEvent({ 'text/html': '<b>x</b>' })
    el.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(el.value).toBe('')
    expect(inputs).toHaveLength(0)
  })

  test('destroy removes the listener', () => {
    const el = document.createElement('input')
    const { action } = setup(el)
    action?.destroy?.()
    const e = pasteEvent({ 'text/plain': 'x' })
    el.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
})
