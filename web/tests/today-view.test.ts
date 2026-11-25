import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { render, screen, waitFor, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../src/App.svelte'
import * as api from '../src/lib/api'
import { formatDue } from '../src/lib/dates'
import { app } from '../src/lib/state.svelte'
import { longDate } from '../src/lib/today'
import { clearToast } from '../src/lib/toast.svelte'
import type { AppState, Task } from '../src/lib/types'
import { ui } from '../src/lib/ui.svelte'
import { fixtureState, makeProject, makeTask, resetApp, TODAY } from './fixtures'

class FakeEventSource {
  close = vi.fn()
  addEventListener() {}
}

let user: ReturnType<typeof userEvent.setup>
let served: AppState
let getState: ReturnType<typeof vi.spyOn>

/** Render App on TODAY with `tasks` as the board; the mocked server serves `served`. */
async function renderToday(tasks?: Task[], projects = fixtureState().projects) {
  served = { ...fixtureState(), projects, ...(tasks ? { tasks } : {}) }
  app.tasks = structuredClone(served.tasks)
  app.projects = structuredClone(served.projects)
  ui.view = 'today'
  const result = render(App)
  await waitFor(() => expect(getState).toHaveBeenCalled())
  await tick()
  return result
}

const rowOf = (title: string) => screen.getByText(title).closest<HTMLElement>('[data-task-id]')!

beforeEach(() => {
  resetApp()
  // Only Date is faked: App's day watch must agree with the fixture's TODAY.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 13, 10, 0))
  vi.stubGlobal('EventSource', FakeEventSource)
  getState = vi.spyOn(api, 'getState').mockImplementation(async () => structuredClone(served))
  ui.view = 'grid'
  ui.picking = false
  ui.openTaskId = null
  ui.contextMenu = null
  ui.modal = null
  user = userEvent.setup()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  clearToast()
})

describe('Today view', () => {
  test('Today tab is enabled and switches view', async () => {
    await renderToday()
    ui.view = 'grid'
    await tick()
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0)
    const tab = screen.getByRole('button', { name: 'Today' })
    expect(tab).toBeEnabled()
    await user.click(tab)
    expect(ui.view).toBe('today')
    expect(tab).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Grid' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('heading', { name: longDate(TODAY) })).toBeInTheDocument()
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0)
    // Grid-only actions are hidden; Plan today stays.
    expect(screen.queryByRole('button', { name: 'Expand all' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Collapse all' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show completed' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Plan today' })).toBeInTheDocument()
    for (const name of ['Kanban', 'Table', 'Stats']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    await user.click(screen.getByRole('button', { name: 'Grid' }))
    expect(ui.view).toBe('grid')
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0)
  })

  test('rows show title, due chip, task type and project chip', async () => {
    await renderToday([
      makeTask({
        id: 'd1',
        title: 'Send costing sheet',
        task_type: 'quick',
        planned_for: TODAY,
        today_order: 0,
        due_date: '2026-11-20',
      }),
    ])
    const row = within(rowOf('Send costing sheet'))
    expect(row.getByText(formatDue('2026-11-20', TODAY))).toBeInTheDocument()
    expect(row.getByText('Quick')).toBeInTheDocument()
    expect(row.getByText('Twin Pilot')).toBeInTheDocument()
    expect(row.getByRole('checkbox', { name: 'Send costing sheet' })).toHaveAttribute('aria-checked', 'false')
  })

  test('empty state offers Plan today', async () => {
    await renderToday([makeTask({ id: 'u', title: 'Not pinned' })])
    expect(screen.getByText('Nothing picked for today')).toBeInTheDocument()
    expect(screen.queryByText('Not pinned')).toBeNull()
    const main = screen.getByText('Nothing picked for today').closest('section, main, div')!
    await user.click(within(main as HTMLElement).getByRole('button', { name: 'Plan today' }))
    expect(ui.picking).toBe(true)
    expect(ui.view).toBe('grid')
  })

  test('the top bar Plan today starts picking too', async () => {
    await renderToday()
    const bar = screen.getByRole('banner')
    await user.click(within(bar).getByRole('button', { name: 'Plan today' }))
    expect(ui.picking).toBe(true)
    expect(ui.view).toBe('grid')
  })

  test('× unpins', async () => {
    const patch = vi.spyOn(api, 'patchTask').mockResolvedValue(fixtureState().tasks[0])
    await renderToday()
    const calls = getState.mock.calls.length
    await user.click(within(rowOf('Finish pilot interim report')).getByRole('button', { name: 'Remove from today' }))
    expect(patch).toHaveBeenCalledWith('t1', { planned_for: null })
    await waitFor(() => expect(getState.mock.calls.length).toBe(calls + 1))
    expect(ui.openTaskId).toBeNull()
  })

  test('a failed unpin shows a toast', async () => {
    vi.spyOn(api, 'patchTask').mockRejectedValue(new api.ApiError(500, 'disk full'))
    await renderToday()
    await user.click(within(rowOf('Finish pilot interim report')).getByRole('button', { name: 'Remove from today' }))
    expect(await screen.findByText("Couldn't update task: disk full")).toBeInTheDocument()
  })

  test('clicking a row opens the task pop-up and Escape returns focus to the row', async () => {
    await renderToday()
    const row = rowOf('Finish pilot interim report')
    await user.click(screen.getByText('Finish pilot interim report'))
    expect(ui.openTaskId).toBe('t1')
    const dialog = await screen.findByRole('dialog')
    // Tab past the last control wraps to the first.
    const focusables = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )]
    focusables[focusables.length - 1].focus()
    await user.tab()
    expect(focusables[0]).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(row).toHaveFocus()
  })

  test('right-click opens the task menu', async () => {
    await renderToday()
    await user.pointer({ keys: '[MouseRight]', target: rowOf('Finish pilot interim report') })
    expect(ui.contextMenu).toMatchObject({ kind: 'task', id: 't1' })
    expect(await screen.findByRole('menuitem', { name: 'Remove from today' })).toBeInTheDocument()
  })

  test('ticking moves a task to Done today', async () => {
    const done = vi.spyOn(api, 'setDone').mockImplementation(async (id) => {
      const t = served.tasks.find((x) => x.id === id)!
      Object.assign(t, {
        status: 'done',
        status_before_done: t.status,
        completed_at: new Date(2026, 10, 13, 10, 0).toISOString(),
        updated_at: new Date(2026, 10, 13, 10, 0).toISOString(),
      })
      return t
    })
    await renderToday()
    await user.click(screen.getByRole('checkbox', { name: 'Finish pilot interim report' }))
    expect(done).toHaveBeenCalledWith('t1', true)
    const heading = await screen.findByText('Done today')
    const section = heading.closest('section')!
    const row = within(section).getByText('Finish pilot interim report').closest<HTMLElement>('[data-task-id]')!
    expect(row).toHaveClass('done')
    expect(within(row).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
    expect(within(row).queryByRole('button', { name: 'Remove from today' })).toBeNull()
    expect(row.querySelector('.grip')).toBeNull()
  })

  test('today view follows app.today', async () => {
    const patch = vi.spyOn(api, 'patchTask')
    const setDone = vi.spyOn(api, 'setDone')
    await renderToday()
    expect(screen.getByText('Finish pilot interim report')).toBeInTheDocument()
    const calls = getState.mock.calls.length
    app.today = '2026-11-14'
    await tick()
    expect(screen.queryByText('Finish pilot interim report')).toBeNull()
    expect(screen.getByText('Nothing picked for today')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: longDate('2026-11-14') })).toBeInTheDocument()
    expect(getState.mock.calls.length).toBe(calls)
    expect(patch).not.toHaveBeenCalled()
    expect(setDone).not.toHaveBeenCalled()
  })

  test('pinned Unsorted and closed-project tasks still show', async () => {
    const projects = [
      ...fixtureState().projects,
      makeProject({ id: 'p3', name: 'Old Bid', colour: 'peach', position: 2, status: 'closed' }),
    ]
    await renderToday(
      [
        makeTask({ id: 'u1', title: 'Loose end', project_id: null, planned_for: TODAY, today_order: 0 }),
        makeTask({ id: 'c1', title: 'Archive bid docs', project_id: 'p3', planned_for: TODAY, today_order: 1 }),
      ],
      projects,
    )
    expect(within(rowOf('Loose end')).getByText('Unsorted')).toBeInTheDocument()
    expect(within(rowOf('Archive bid docs')).getByText('Old Bid')).toBeInTheDocument()
  })

  test('no progress bar or count', async () => {
    const { container } = await renderToday([
      makeTask({ id: 'a', title: 'One', planned_for: TODAY, today_order: 0 }),
      makeTask({
        id: 'b',
        title: 'Two',
        planned_for: TODAY,
        status: 'done',
        completed_at: new Date(2026, 10, 13, 9, 0).toISOString(),
      }),
    ])
    expect(screen.getByText('Done today')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(container.textContent).not.toMatch(/\d+ of \d+/)
  })
})
