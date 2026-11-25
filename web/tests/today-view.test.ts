import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
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

// The Grid stays mounted, hidden, under Today, so look only inside the Today view (its <main>).
const todayView = () => within(screen.getByRole('main'))
const rowOf = (title: string) => todayView().getByText(title).closest<HTMLElement>('[data-task-id]')!

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

  test('today row due chip shows its state', async () => {
    await renderToday([
      makeTask({ id: 'a1', title: 'Late row', planned_for: TODAY, today_order: 0, due_date: '2026-11-12' }),
      makeTask({ id: 'a2', title: 'Soon row', planned_for: TODAY, today_order: 1, due_date: '2026-11-20' }),
    ])
    expect(rowOf('Late row').querySelector('.due')).toHaveAttribute('data-due', 'overdue')
    expect(rowOf('Soon row').querySelector('.due')).toHaveAttribute('data-due', 'future')
  })

  describe('row columns', () => {
    const COLS = ['c-grip', 'c-tick', 'c-title', 'c-due', 'c-type', 'c-project', 'c-x']
    const cells = (row: HTMLElement) => Array.from(row.children).map((c) => c.className.split(' ')[0])

    test('every row renders the same columns', async () => {
      await renderToday([
        makeTask({ id: 'c1', title: 'Dated', planned_for: TODAY, today_order: 0, due_date: '2026-11-20' }),
        makeTask({ id: 'c2', title: 'Undated', planned_for: TODAY, today_order: 1 }),
        makeTask({ id: 'c3', title: 'Finished', planned_for: TODAY, today_order: 2, status: 'done',
          completed_at: new Date(2026, 10, 13, 9, 0).toISOString() }),
      ])
      for (const t of ['Dated', 'Undated', 'Finished']) expect(cells(rowOf(t))).toEqual(COLS)
    })

    test('a row without a due date keeps an empty due cell', async () => {
      await renderToday([makeTask({ id: 'c2', title: 'Undated', planned_for: TODAY, today_order: 0 })])
      const due = rowOf('Undated').querySelector('.c-due')!
      expect(due).toBeEmptyDOMElement()
    })

    test('done row keeps empty grip and x cells', async () => {
      await renderToday([
        makeTask({ id: 'c3', title: 'Finished', planned_for: TODAY, today_order: 0, status: 'done',
          completed_at: new Date(2026, 10, 13, 9, 0).toISOString() }),
      ])
      const row = rowOf('Finished')
      expect(row.querySelector('.c-grip')).toBeEmptyDOMElement()
      expect(row.querySelector('.c-x')).toBeEmptyDOMElement()
    })
  })

  describe('narrow windows', () => {
    test('the Today list is a named size container', async () => {
      const { container } = await renderToday([
        makeTask({ id: 'n1', title: 'Open one', planned_for: TODAY, today_order: 0 }),
        makeTask({ id: 'n2', title: 'Done one', planned_for: TODAY, today_order: 1, status: 'done',
          completed_at: new Date(2026, 10, 13, 9, 0).toISOString() }),
      ])
      const box = container.querySelector('[data-size-container="today"]')!
      expect(box).not.toBeNull()
      // Both the open list and Done today sit inside the one container.
      expect(box.contains(rowOf('Open one'))).toBe(true)
      expect(box.contains(rowOf('Done one'))).toBe(true)
    })

    test('task type cell is still rendered for narrow layouts to hide', async () => {
      await renderToday([
        makeTask({ id: 'n1', title: 'Open one', task_type: 'quick', planned_for: TODAY, today_order: 0 }),
        makeTask({ id: 'n2', title: 'Done one', planned_for: TODAY, today_order: 1, status: 'done',
          completed_at: new Date(2026, 10, 13, 9, 0).toISOString() }),
      ])
      for (const t of ['Open one', 'Done one']) expect(rowOf(t).querySelector('.c-type')).not.toBeNull()
    })
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
    expect(todayView().queryByText('Not pinned')).toBeNull()
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
    await user.click(todayView().getByText('Finish pilot interim report'))
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
    expect(todayView().getByText('Finish pilot interim report')).toBeInTheDocument()
    const calls = getState.mock.calls.length
    app.today = '2026-11-14'
    await tick()
    expect(todayView().queryByText('Finish pilot interim report')).toBeNull()
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

  describe('reordering', () => {
    const three = () => [
      makeTask({ id: 'a', title: 'Alpha', planned_for: TODAY, today_order: 0 }),
      makeTask({ id: 'b', title: 'Bravo', planned_for: TODAY, today_order: 1 }),
      makeTask({ id: 'c', title: 'Charlie', planned_for: TODAY, today_order: 2 }),
    ]
    const titles = () =>
      [...document.querySelectorAll<HTMLElement>('.list [data-task-id]')].map((r) => r.dataset.taskId)

    /** The server applies a reorder to `served`, as the real one does. */
    const serve = () =>
      vi.spyOn(api, 'reorderToday').mockImplementation(async (_date, ids) => {
        ids.forEach((id, i) => (served.tasks.find((t) => t.id === id)!.today_order = i))
        return []
      })

    test('Alt+ArrowDown moves the focused row down', async () => {
      const reorder = serve()
      await renderToday(three())
      rowOf('Alpha').focus()
      await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
      expect(reorder).toHaveBeenCalledWith(TODAY, ['b', 'a', 'c'])
      expect(titles()).toEqual(['b', 'a', 'c'])
      await waitFor(() => expect(getState.mock.calls.length).toBeGreaterThan(1))
      await tick()
      expect(titles()).toEqual(['b', 'a', 'c'])
      expect(rowOf('Alpha')).toHaveFocus()
    })

    test('Alt+ArrowUp on the first row sends nothing', async () => {
      const reorder = serve()
      await renderToday(three())
      rowOf('Alpha').focus()
      await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
      expect(reorder).not.toHaveBeenCalled()
    })

    function dt() {
      const data: Record<string, string> = {}
      return {
        effectAllowed: '',
        dropEffect: '',
        get types() {
          return Object.keys(data)
        },
        setData: (t: string, v: string) => (data[t] = v),
        getData: (t: string) => data[t] ?? '',
      }
    }
    function fire(el: Element, type: string, d: ReturnType<typeof dt>, clientY = 0) {
      const ev = new Event(type, { bubbles: true, cancelable: true })
      Object.assign(ev, { dataTransfer: d, clientY })
      el.dispatchEvent(ev)
      return ev
    }

    test('drag a row to a new position', async () => {
      const reorder = serve()
      await renderToday(three())
      document.querySelectorAll<HTMLElement>('.list [data-task-id]').forEach((c, i) => {
        c.getBoundingClientRect = () => ({ top: i * 20, bottom: i * 20 + 20, height: 20 }) as DOMRect
      })
      const d = dt()
      fire(rowOf('Alpha'), 'dragstart', d)
      const over = fire(rowOf('Charlie'), 'dragover', d)
      expect(over.defaultPrevented).toBe(true)
      // 45 is below Bravo's midpoint (30) and above Charlie's (50): between them.
      fire(rowOf('Charlie'), 'drop', d, 45)
      await waitFor(() => expect(reorder).toHaveBeenCalledWith(TODAY, ['b', 'a', 'c']))
      await waitFor(() => expect(titles()).toEqual(['b', 'a', 'c']))
    })

    test('dropping a row where it already is sends nothing', async () => {
      const reorder = serve()
      await renderToday(three())
      document.querySelectorAll<HTMLElement>('.list [data-task-id]').forEach((c, i) => {
        c.getBoundingClientRect = () => ({ top: i * 20, bottom: i * 20 + 20, height: 20 }) as DOMRect
      })
      const d = dt()
      fire(rowOf('Alpha'), 'dragstart', d)
      fire(rowOf('Bravo'), 'drop', d, 15)
      expect(reorder).not.toHaveBeenCalled()
    })

    test('a drag that starts on the tick box is cancelled', async () => {
      await renderToday(three())
      const d = dt()
      const ev = fire(screen.getByRole('checkbox', { name: 'Alpha' }), 'dragstart', d)
      expect(ev.defaultPrevented).toBe(true)
    })

    test('a drag ending on its own row does not open the pop-up, and the next press does', async () => {
      await renderToday(three())
      const row = rowOf('Alpha')
      const d = dt()
      fire(row, 'dragstart', d)
      // No dragend (Chromium may not send one): the click that ends the drag is swallowed.
      await fireEvent.click(row)
      expect(ui.openTaskId).toBeNull()
      await user.click(row)
      expect(ui.openTaskId).toBe('a')
    })

    test('reorder failure toasts and refreshes', async () => {
      vi.spyOn(api, 'reorderToday').mockRejectedValue(new api.ApiError(422, 'task 1234 is not pinned'))
      await renderToday(three())
      const calls = getState.mock.calls.length
      rowOf('Alpha').focus()
      await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
      expect(
        await screen.findByText("Couldn't reorder: the list changed, so it has been reloaded"),
      ).toBeInTheDocument()
      await waitFor(() => expect(getState.mock.calls.length).toBe(calls + 1))
      await waitFor(() => expect(titles()).toEqual(['a', 'b', 'c']))
    })

    test('other reorder failures show their reason', async () => {
      vi.spyOn(api, 'reorderToday').mockRejectedValue(new api.ApiError(500, 'disk full'))
      await renderToday(three())
      rowOf('Alpha').focus()
      await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
      expect(await screen.findByText("Couldn't reorder: disk full")).toBeInTheDocument()
    })

    test('three quick Alt+ArrowDown presses send three requests in order', async () => {
      const reorder = serve()
      await renderToday([
        ...three(),
        makeTask({ id: 'd', title: 'Delta', planned_for: TODAY, today_order: 3 }),
      ])
      rowOf('Alpha').focus()
      await user.keyboard('{Alt>}{ArrowDown}{ArrowDown}{ArrowDown}{/Alt}')
      expect(reorder.mock.calls.map((c) => c[1])).toEqual([
        ['b', 'a', 'c', 'd'],
        ['b', 'c', 'a', 'd'],
        ['b', 'c', 'd', 'a'],
      ])
      await waitFor(() => expect(titles()).toEqual(['b', 'c', 'd', 'a']))
      expect(rowOf('Alpha')).toHaveFocus()
    })

    test("done rows can't be dragged", async () => {
      await renderToday([
        ...three(),
        makeTask({
          id: 'z',
          title: 'Zulu',
          planned_for: TODAY,
          status: 'done',
          completed_at: new Date(2026, 10, 13, 9, 0).toISOString(),
        }),
      ])
      expect(rowOf('Zulu')).not.toHaveAttribute('draggable', 'true')
      expect(rowOf('Alpha')).toHaveAttribute('draggable', 'true')
    })
  })

  describe('the Grid stays mounted under Today', () => {
    const quickCell = () =>
      within(screen.getByRole('row', { name: 'Quick' })).getAllByRole('gridcell')[0]

    test('typed + add text survives a trip to Today and back', async () => {
      await renderToday()
      await user.click(screen.getByRole('button', { name: 'Grid' }))
      const cell = quickCell()
      await user.click(within(cell).getByRole('button', { name: '+ add' }))
      await user.type(within(cell).getByRole('textbox', { name: 'New task' }), 'Half typed')
      await user.click(screen.getByRole('button', { name: 'Today' }))
      expect(screen.queryByRole('textbox', { name: 'New task' })).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Grid' }))
      expect(within(quickCell()).getByRole('textbox', { name: 'New task' })).toHaveValue('Half typed')
    })

    test('pop-up opened from a Grid card returns focus to that card', async () => {
      await renderToday()
      await user.click(screen.getByRole('button', { name: 'Grid' }))
      const card = within(screen.getByRole('grid')).getByText('Finish pilot interim report')
        .closest<HTMLElement>('[data-task-id]')!
      await user.click(within(card).getByText('Finish pilot interim report'))
      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(card).toHaveFocus()
    })

    test('a Today row redrawn under its pop-up gets focus back, not the hidden Grid card', async () => {
      vi.spyOn(api, 'setDone').mockImplementation(async (id) => {
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
      // Done cards show on the Grid too, so the hidden Grid keeps a copy of the ticked task.
      served.settings.show_completed = true
      app.settings.show_completed = true
      await user.click(todayView().getByText('Finish pilot interim report'))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('checkbox', { name: 'Done' }))
      const done = await screen.findByRole('region', { name: 'Done today' })
      const row = within(done).getByText('Finish pilot interim report').closest<HTMLElement>('[data-task-id]')!
      expect(document.querySelectorAll('[data-task-id="t1"]')).toHaveLength(2)
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(row).toHaveFocus()
    })

    test('a menu opened on Today shows once, not also in the hidden Grid', async () => {
      await renderToday()
      await user.pointer({ keys: '[MouseRight]', target: rowOf('Finish pilot interim report') })
      expect(await screen.findByRole('menuitem', { name: 'Remove from today' })).toBeInTheDocument()
      expect(document.querySelectorAll('[role=menu]')).toHaveLength(1)
    })
  })
})
