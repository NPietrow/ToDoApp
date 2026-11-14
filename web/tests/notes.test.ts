import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import NotesCell from '../src/components/NotesCell.svelte'
import * as api from '../src/lib/api'
import { app } from '../src/lib/state.svelte'
import { clearToast, toast } from '../src/lib/toast.svelte'
import { FakeResizeObserver, fixtureState, resetApp } from './fixtures'

let user: ReturnType<typeof userEvent.setup>
let put: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetApp()
  vi.useFakeTimers()
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  put = vi.spyOn(api, 'putNotes').mockResolvedValue(undefined)
  vi.spyOn(api, 'getState').mockImplementation(async () => fixtureState())
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  clearToast()
})

describe('notes cell', () => {
  test('never scrolls inside itself', () => {
    render(NotesCell, { projectId: 'p1' })
    const box = screen.getByRole('textbox', { name: 'Notes' })
    const overflow = getComputedStyle(box).overflowY
    expect(overflow).not.toBe('scroll')
    expect(overflow).not.toBe('auto')
    expect(box).toHaveValue('Sam: firewall change needs IT ticket')
  })

  test('saves 400 ms after the last keystroke', async () => {
    render(NotesCell, { projectId: 'p1' })
    const box = screen.getByRole('textbox', { name: 'Notes' })
    await user.click(box)
    await user.type(box, '!')
    expect(put).not.toHaveBeenCalled()
    vi.advanceTimersByTime(399)
    expect(put).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith('p1', 'Sam: firewall change needs IT ticket!')
  })

  test('blur flushes the pending save once', async () => {
    render(NotesCell, { projectId: 'p1' })
    const box = screen.getByRole('textbox', { name: 'Notes' })
    await user.click(box)
    await user.type(box, '?')
    await user.tab()
    expect(put).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(put).toHaveBeenCalledTimes(1)
  })

  test('Enter continues a bullet', async () => {
    app.notes = { p1: '- one' }
    render(NotesCell, { projectId: 'p1' })
    const box = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
    await user.click(box)
    await user.keyboard('{Control>}{End}{/Control}{Enter}')
    expect(box.value).toBe('- one\n- ')
  })

  test('a refresh does not overwrite while typing, but does when idle', async () => {
    render(NotesCell, { projectId: 'p1' })
    const box = screen.getByRole('textbox', { name: 'Notes' })
    await user.click(box)
    await user.type(box, 'x')
    app.notes = { p1: 'from elsewhere' }
    await vi.advanceTimersByTimeAsync(0)
    expect(box).toHaveValue('Sam: firewall change needs IT ticketx')
    await user.tab()
    await vi.advanceTimersByTimeAsync(0)
    app.notes = { p1: 'later' }
    await vi.advanceTimersByTimeAsync(0)
    expect(box).toHaveValue('later')
  })

  test('is read-only while its file is reported unreadable, so it is never overwritten', async () => {
    app.notes = { p1: '' }
    app.problems = [{ file: 'notes/p1.txt', error: 'not UTF-8 text; save it as UTF-8' }]
    render(NotesCell, { projectId: 'p1' })
    const box = screen.getByRole('textbox', { name: 'Notes' })
    expect(box).toHaveAttribute('readonly')
    expect(box).toHaveAttribute('placeholder', "Can't read this notes file: see file problems")
    await user.click(box)
    await user.type(box, 'typed')
    await user.paste('pasted')
    await user.keyboard('{Enter}')
    await user.tab()
    await vi.advanceTimersByTimeAsync(1000)
    expect(box).toHaveValue('')
    expect(put).not.toHaveBeenCalled()
  })

  test('a failed save toasts', async () => {
    put.mockRejectedValue(new Error('disk full'))
    render(NotesCell, { projectId: 'p1' })
    const box = screen.getByRole('textbox', { name: 'Notes' })
    await user.click(box)
    await user.type(box, '!')
    await vi.advanceTimersByTimeAsync(400)
    expect(toast.current?.message).toContain('disk full')
  })

  test('refits its height when its width changes, without a keystroke', () => {
    let scrollHeight = 40
    let clientWidth = 300
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight })
    Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', { configurable: true, get: () => clientWidth })
    try {
      render(NotesCell, { projectId: 'p1' })
      const box = screen.getByRole('textbox', { name: 'Notes' })
      expect(box.style.height).toBe('40px')
      const observer = FakeResizeObserver.instances.find((o) => o.observed.includes(box))!
      scrollHeight = 90
      observer.callback() // same width: ignored
      expect(box.style.height).toBe('40px')
      clientWidth = 200
      observer.callback()
      expect(box.style.height).toBe('90px')
    } finally {
      delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight
      delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).clientWidth
    }
  })
})
