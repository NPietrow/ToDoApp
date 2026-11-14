import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import PasteTasksModal from '../src/components/PasteTasksModal.svelte'
import * as api from '../src/lib/api'
import { clearToast, toast } from '../src/lib/toast.svelte'
import type { PreviewResult } from '../src/lib/types'
import { ui } from '../src/lib/ui.svelte'
import { fixtureState, makeTask, resetApp } from './fixtures'

const CHAT = 'Sure! Here are your tasks:\n- Chase Sam (Line 4 Bid)\n- Buy milk'
const PREVIEW: PreviewResult = {
  items: [
    { title: 'Chase Sam', project_id: 'p9', project_name: 'Line 4 Bid', task_type: 'general', due_date: null },
    { title: 'Buy milk', project_id: null, project_name: null, task_type: 'general', due_date: null },
  ],
  errors: ['Line 7: no title'],
}

let user: ReturnType<typeof userEvent.setup>
let preview: ReturnType<typeof vi.spyOn>
let importer: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetApp()
  ui.modal = 'paste'
  user = userEvent.setup()
  preview = vi.spyOn(api, 'previewIntake').mockResolvedValue(PREVIEW)
  importer = vi.spyOn(api, 'importIntake').mockResolvedValue({
    imported: [makeTask({ id: 'a', title: 'a' }), makeTask({ id: 'b', title: 'b' })],
    errors: [],
  })
  vi.spyOn(api, 'getState').mockImplementation(async () => fixtureState())
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  clearToast()
  ui.modal = null
})

describe('paste tasks modal', () => {
  test('previews a chatty reply and imports the same text', async () => {
    render(PasteTasksModal)
    const importBtn = screen.getByRole('button', { name: 'Import' })
    expect(importBtn).toBeDisabled()
    await user.click(screen.getByRole('textbox', { name: 'Paste tasks' }))
    await user.paste(CHAT)
    expect(await screen.findByText('2 tasks → Line 4 Bid ×1, Unsorted ×1')).toBeInTheDocument()
    expect(screen.getByText('Line 7: no title')).toBeInTheDocument()
    expect(preview).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith(CHAT)
    await waitFor(() => expect(importBtn).toBeEnabled())
    await user.click(importBtn)
    expect(importer).toHaveBeenCalledWith(CHAT)
    await waitFor(() => expect(ui.modal).toBeNull())
    expect(toast.current?.message).toBe('Imported 2 tasks')
  })

  test('says how many lines were skipped', async () => {
    importer.mockResolvedValue({ imported: [makeTask({ id: 'a', title: 'a' })], errors: ['x', 'y'] })
    render(PasteTasksModal)
    await user.click(screen.getByRole('textbox', { name: 'Paste tasks' }))
    await user.paste(CHAT)
    const importBtn = screen.getByRole('button', { name: 'Import' })
    await waitFor(() => expect(importBtn).toBeEnabled())
    await user.click(importBtn)
    await waitFor(() => expect(toast.current?.message).toBe('Imported 1 tasks (2 skipped)'))
  })

  test('debounces the preview by 300 ms and ignores a stale response', async () => {
    vi.useFakeTimers()
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    let first!: (r: PreviewResult) => void
    preview.mockReset()
    preview
      .mockImplementationOnce(() => new Promise<PreviewResult>((r) => (first = r)))
      .mockResolvedValueOnce({ items: [PREVIEW.items[1]], errors: [] })
    render(PasteTasksModal)
    const box = screen.getByRole('textbox', { name: 'Paste tasks' })
    await user.click(box)
    await user.type(box, 'ab')
    expect(preview).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(preview).toHaveBeenCalledTimes(1)
    await user.type(box, 'c')
    await vi.advanceTimersByTimeAsync(300)
    expect(preview).toHaveBeenCalledTimes(2)
    expect(screen.getByText('1 task → Unsorted ×1')).toBeInTheDocument()
    first(PREVIEW)
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByText('1 task → Unsorted ×1')).toBeInTheDocument()
  })

  test('Escape closes it', async () => {
    render(PasteTasksModal)
    await user.keyboard('{Escape}')
    expect(ui.modal).toBeNull()
  })
})
