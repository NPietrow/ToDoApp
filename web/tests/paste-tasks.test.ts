import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import PasteTasksModal from '../src/components/PasteTasksModal.svelte'
import * as api from '../src/lib/api'
import { ApiError } from '../src/lib/api'
import { clearToast, toast } from '../src/lib/toast.svelte'
import type { PreviewResult } from '../src/lib/types'
import { ui } from '../src/lib/ui.svelte'
import { app } from '../src/lib/state.svelte'
import { fixtureState, makeProject, makeTask, resetApp } from './fixtures'

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

  test('the placeholder says it wants JSON from an AI reply', () => {
    render(PasteTasksModal)
    expect(screen.getByRole('textbox', { name: 'Paste tasks' })).toHaveAttribute(
      'placeholder',
      'Paste an AI reply that contains the tasks as JSON. Chat around it is fine.',
    )
  })

  test('the example names the first active project and a date 14 days on, and goes when typing starts', async () => {
    app.projects = [
      makeProject({ id: 'c', name: 'Closed One', status: 'closed', position: 0 }),
      makeProject({ id: 'b', name: 'Second', position: 1 }),
      makeProject({ id: 'a', name: 'First "Quoted"', position: 0 }),
    ]
    render(PasteTasksModal)
    const example = screen.getByText(/Here are your actions:/)
    expect(screen.getByText('Example')).toBeInTheDocument()
    expect(example.tagName).toBe('PRE')
    const body = example.textContent ?? ''
    expect(body).toContain('"project": "First \\"Quoted\\""')
    expect(body).toContain('"due_date": "2026-11-27"') // TODAY is 2026-11-13
    expect(JSON.parse(body.slice(body.indexOf('[')))).toHaveLength(2) // real JSON
    await user.click(screen.getByRole('textbox', { name: 'Paste tasks' }))
    await user.keyboard('x')
    expect(screen.queryByText('Example')).toBeNull()
  })

  test('the example falls back to Twin Pilot with no projects', () => {
    app.projects = []
    render(PasteTasksModal)
    expect(screen.getByText(/Here are your actions:/).textContent).toContain('"project": "Twin Pilot"')
  })

  test('Use this example fills the box and previews it', async () => {
    render(PasteTasksModal)
    const shown = screen.getByText(/Here are your actions:/).textContent
    await user.click(screen.getByRole('button', { name: 'Use this example' }))
    expect(screen.getByRole('textbox', { name: 'Paste tasks' })).toHaveValue(shown)
    expect(preview).toHaveBeenCalledWith(shown)
    expect(await screen.findByText('2 tasks → Line 4 Bid ×1, Unsorted ×1')).toBeInTheDocument()
    expect(screen.queryByText('Example')).toBeNull()
  })

  test('Copy AI prompt copies the prompt with the active project names, then reads Copied', async () => {
    app.projects = [
      makeProject({ id: 'a', name: 'Twin Pilot', position: 0 }),
      makeProject({ id: 'b', name: 'Data Platform', position: 1 }),
      makeProject({ id: 'c', name: 'Old Job', status: 'closed', position: 2 }),
    ]
    render(PasteTasksModal)
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await user.click(screen.getByRole('button', { name: 'Copy AI prompt' }))
    expect(write).toHaveBeenCalledTimes(1)
    const prompt = write.mock.calls[0][0]
    expect(prompt).toContain('Use these project names exactly: Twin Pilot, Data Platform.')
    expect(prompt).not.toContain('[your project names]')
    expect(prompt).not.toContain('Old Job')
    expect(prompt).toContain('Reply with only the JSON.')
    expect(prompt).toContain('"title"') // the inline shape, so no schema file is needed
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    // typing puts the button back
    await user.click(screen.getByRole('textbox', { name: 'Paste tasks' }))
    await user.keyboard('x')
    expect(screen.getByRole('button', { name: 'Copy AI prompt' })).toBeInTheDocument()
  })

  test('if the clipboard refuses, the prompt is shown to copy by hand', async () => {
    render(PasteTasksModal)
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await user.click(screen.getByRole('button', { name: 'Copy AI prompt' }))
    const box = await screen.findByRole('textbox', { name: 'AI prompt' })
    expect(box).toHaveAttribute('readonly')
    expect((box as HTMLTextAreaElement).value).toContain('Use these project names exactly: Twin Pilot, Data Platform.')
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull()
  })

  test('"no tasks found" gets a friendlier line', async () => {
    preview.mockRejectedValue(new ApiError(422, 'no tasks found'))
    render(PasteTasksModal)
    await user.click(screen.getByRole('textbox', { name: 'Paste tasks' }))
    await user.paste('Just some chat, no JSON')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No JSON tasks found. Ask your AI for JSON (Copy AI prompt), or see the example below.',
    )
    expect(screen.queryByText('no tasks found')).toBeNull()
    expect(screen.getByText('Example')).toBeInTheDocument() // the line points at it
  })

  test('other preview errors are shown as they are', async () => {
    preview.mockRejectedValue(new ApiError(500, 'disk on fire'))
    render(PasteTasksModal)
    await user.click(screen.getByRole('textbox', { name: 'Paste tasks' }))
    await user.paste('x')
    expect(await screen.findByRole('alert')).toHaveTextContent('disk on fire')
  })
})
