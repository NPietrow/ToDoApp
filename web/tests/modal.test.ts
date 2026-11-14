import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import DatePicker from '../src/components/DatePicker.svelte'
import Grid from '../src/components/Grid.svelte'
import TaskModal from '../src/components/TaskModal.svelte'
import Toast from '../src/components/Toast.svelte'
import * as api from '../src/lib/api'
import { dialogFocus } from '../src/lib/dialog'
import { app } from '../src/lib/state.svelte'
import { clearToast, toast } from '../src/lib/toast.svelte'
import type { Task } from '../src/lib/types'
import { ui } from '../src/lib/ui.svelte'
import { fixtureState, makeTask, resetApp, TASK, TODAY } from './fixtures'

let user: ReturnType<typeof userEvent.setup>
let current: Task
let patch: ReturnType<typeof vi.spyOn>

/** Open the modal on `task`, with a fake server that applies patches and serves them back. */
function setup(task: Task = TASK) {
  current = structuredClone(task)
  app.tasks = [current]
  ui.openTaskId = task.id
  patch = vi.spyOn(api, 'patchTask').mockImplementation(async (_id, ch) => {
    current = { ...current, ...ch } as Task
    return current
  })
  vi.spyOn(api, 'getState').mockImplementation(async () => ({
    ...fixtureState(),
    tasks: [current],
  }))
}

beforeEach(() => {
  resetApp()
  ui.openTaskId = null
  ui.contextMenu = null
  user = userEvent.setup()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  clearToast()
  ui.openTaskId = null
})

describe('task modal', () => {
  test('opens from task click and saves title after 400ms', async () => {
    vi.useFakeTimers()
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setup()
    render(TaskModal)
    const title = screen.getByRole('textbox', { name: 'Title' })
    await user.clear(title)
    await user.type(title, 'New title')
    expect(patch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(patch).toHaveBeenCalledTimes(1)
    expect(patch).toHaveBeenCalledWith(TASK.id, { title: 'New title' })
  })

  test('clicking a card sets the open id, but the tick box does not', async () => {
    resetApp()
    ui.openTaskId = null
    vi.spyOn(api, 'setDone').mockResolvedValue(TASK)
    vi.spyOn(api, 'getState').mockResolvedValue(fixtureState())
    render(Grid)
    await user.click(screen.getByText('Chase Sam re: sensor access'))
    expect(ui.openTaskId).toBe('t3')
    ui.openTaskId = null
    await user.click(screen.getByRole('checkbox', { name: 'Chase Sam re: sensor access' }))
    expect(ui.openTaskId).toBeNull()
  })

  test('quick pick Next Monday sets due date', async () => {
    setup()
    render(TaskModal)
    await user.click(screen.getByRole('button', { name: /no date/i }))
    await user.click(screen.getByText('Next Monday'))
    expect(patch).toHaveBeenCalledWith(TASK.id, { due_date: '2026-11-16' })
  })

  test('today toggle sets and clears planned_for', async () => {
    setup()
    render(TaskModal)
    const toggle = screen.getByLabelText("On today's list")
    await user.click(toggle)
    expect(patch).toHaveBeenLastCalledWith(TASK.id, { planned_for: TODAY })
    await waitFor(() => expect(toggle).toBeChecked())
    await user.click(toggle)
    expect(patch).toHaveBeenLastCalledWith(TASK.id, { planned_for: null })
  })

  test('Blocked segment saves status; Task type segment saves task_type', async () => {
    setup()
    render(TaskModal)
    await user.click(screen.getByRole('button', { name: 'Blocked' }))
    expect(patch).toHaveBeenCalledWith(TASK.id, { status: 'blocked' })
    await user.click(screen.getByRole('button', { name: 'Objectives' }))
    expect(patch).toHaveBeenCalledWith(TASK.id, { task_type: 'objective' })
  })

  test('description shows links and markup as text; Enter after bullet continues it', async () => {
    setup(makeTask({ id: 't-new', title: 'T', description: '- see https://a.example/x <b>hi</b>' }))
    render(TaskModal)
    const link = screen.getByRole('link', { name: 'https://a.example/x' })
    expect(link).toHaveAttribute('href', 'https://a.example/x')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText(/<b>hi<\/b>/)).toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
    // A click on the link does not start editing.
    link.addEventListener('click', (e) => e.preventDefault())
    await user.click(link)
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
    // A click on the text does.
    await user.click(screen.getByText(/<b>hi<\/b>/))
    const box = (await screen.findByRole('textbox', { name: 'Description' })) as HTMLTextAreaElement
    expect(box).toHaveFocus()
    box.setSelectionRange(box.value.length, box.value.length)
    await user.keyboard('{Enter}')
    expect(box.value.endsWith('\n- ')).toBe(true)
  })

  test('Esc closes and flushes pending save exactly once', async () => {
    setup()
    render(TaskModal)
    await user.type(screen.getByRole('textbox', { name: 'Title' }), '!')
    expect(patch).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(patch).toHaveBeenCalledTimes(1)
    expect(patch).toHaveBeenCalledWith(TASK.id, { title: 'Chase Sam!' })
    expect(ui.openTaskId).toBeNull()
    await new Promise((r) => setTimeout(r, 450))
    expect(patch).toHaveBeenCalledTimes(1)
  })

  test('Escape closes an open date picker first and leaves the modal open', async () => {
    setup()
    render(TaskModal)
    await user.click(screen.getByRole('button', { name: /no date/i }))
    expect(screen.getByText('Next Monday')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByText('Next Monday')).toBeNull()
    expect(ui.openTaskId).toBe(TASK.id)
    await user.keyboard('{Escape}')
    expect(ui.openTaskId).toBeNull()
  })

  test('the backdrop closes it; clicking inside does not', async () => {
    setup()
    render(TaskModal)
    await user.click(screen.getByText('Description'))
    expect(ui.openTaskId).toBe(TASK.id)
    await user.click(screen.getByTestId('task-backdrop'))
    expect(ui.openTaskId).toBeNull()
  })

  test('closes itself when the task disappears', async () => {
    setup()
    render(TaskModal)
    app.tasks = []
    await waitFor(() => expect(ui.openTaskId).toBeNull())
  })

  test('an incoming refresh does not overwrite a focused title', async () => {
    setup()
    render(TaskModal)
    const title = screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement
    await user.type(title, 'XY')
    app.tasks = [{ ...current, title: 'Changed elsewhere' }]
    await Promise.resolve()
    expect(title.value).toBe('Chase SamXY')
  })

  test('Delete removes the task with an undo toast and closes', async () => {
    setup()
    const del = vi.spyOn(api, 'deleteTask').mockResolvedValue(undefined)
    render(TaskModal)
    render(Toast)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(del).toHaveBeenCalledWith(TASK.id)
    expect(ui.openTaskId).toBeNull()
    await waitFor(() => expect(toast.current?.actionLabel).toBe('Undo'))
  })

  test('a failed save shows a toast', async () => {
    setup()
    patch.mockRejectedValue(new Error('disk full'))
    render(TaskModal)
    await user.click(screen.getByRole('button', { name: 'Blocked' }))
    await waitFor(() => expect(toast.current?.message).toContain('disk full'))
  })

  test('footer shows created and updated stamps', () => {
    const t = makeTask({
      id: 't-new',
      title: 'T',
      created_at: new Date(2026, 10, 4, 8, 0).toISOString(),
      updated_at: new Date(2026, 10, 13, 9, 12).toISOString(),
    })
    setup(t)
    render(TaskModal)
    expect(screen.getByText('Created 4 Nov · Updated 13 Nov 09:12')).toBeInTheDocument()
  })
})

describe('DatePicker', () => {
  test('weeks start on Monday and a day click reports it', async () => {
    const onchange = vi.fn()
    render(DatePicker, { value: '2026-11-13', onchange })
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(heads).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'])
    // 1 Nov 2026 is a Sunday: it sits in the last column of the first row.
    const cells = screen.getAllByRole('gridcell')
    expect(cells[6]).toHaveTextContent('1')
    expect(cells[6].querySelector('button')).toHaveAttribute('aria-label', '2026-11-01')
    await user.click(screen.getByRole('button', { name: '2026-11-20' }))
    expect(onchange).toHaveBeenCalledWith('2026-11-20')
  })

  test('quick picks and Clear', async () => {
    const onchange = vi.fn()
    app.today = TODAY
    render(DatePicker, { value: null, onchange })
    await user.click(screen.getByText('Today'))
    await user.click(screen.getByText('Tomorrow'))
    await user.click(screen.getByText('Clear'))
    expect(onchange.mock.calls.map((c) => c[0])).toEqual(['2026-11-13', '2026-11-14', null])
  })
})

describe('dialogFocus returnFocus', () => {
  test('falls back to returnFocus when the opener is gone', () => {
    const fallback = document.createElement('button')
    const opener = document.createElement('button')
    document.body.append(fallback, opener)
    opener.focus()
    const node = document.createElement('div')
    document.body.append(node)
    const action = dialogFocus(node, { onEscape() {}, returnFocus: () => fallback })
    opener.remove()
    action.destroy()
    expect(fallback).toHaveFocus()
    fallback.remove()
    node.remove()
  })

  test('the opener still wins when it is connected', () => {
    const fallback = document.createElement('button')
    const opener = document.createElement('button')
    document.body.append(fallback, opener)
    opener.focus()
    const node = document.createElement('div')
    document.body.append(node)
    const action = dialogFocus(node, { onEscape() {}, returnFocus: () => fallback })
    action.destroy()
    expect(opener).toHaveFocus()
    fallback.remove()
    opener.remove()
    node.remove()
  })
})
