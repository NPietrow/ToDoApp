import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../src/App.svelte'
import * as api from '../src/lib/api'
import { app } from '../src/lib/state.svelte'
import { clearToast, toast } from '../src/lib/toast.svelte'
import { todayWrites } from '../src/lib/today'
import type { AppState, Task } from '../src/lib/types'
import { ui } from '../src/lib/ui.svelte'
import { fixtureState, makeTask, resetApp, TODAY } from './fixtures'

class FakeEventSource {
  close = vi.fn()
  addEventListener() {}
}

const BANNER = (n: number) => `Picking for today: ${n} picked · click a task to add or remove it · Esc to finish`

let user: ReturnType<typeof userEvent.setup>
let served: AppState
let getState: ReturnType<typeof vi.spyOn>
let patchTask: ReturnType<typeof vi.spyOn>
let logPlanning: ReturnType<typeof vi.spyOn>
/** Lets a held write through; called after each test so a failed test cannot block the write queue. */
let release: (() => void) | undefined

/** The fixture with nothing pinned for today. */
const unpinned = (): Task[] => fixtureState().tasks.map((t) => ({ ...t, planned_for: null }))

/** Render App on the Grid in picking mode (or on `view` without it), serving `tasks`. */
async function renderApp(opts: { tasks?: Task[]; picking?: boolean; view?: 'grid' | 'today' } = {}) {
  served = { ...fixtureState(), ...(opts.tasks ? { tasks: opts.tasks } : {}) }
  app.tasks = structuredClone(served.tasks)
  ui.view = opts.view ?? 'grid'
  ui.picking = opts.picking ?? true
  const result = render(App)
  await waitFor(() => expect(getState).toHaveBeenCalled())
  await tick()
  return result
}

/** Let every queued Today write, the reload after it and the log call settle. */
async function endPickingSettled() {
  await todayWrites(() => Promise.resolve())
  for (let i = 0; i < 5; i++) await tick()
}

/** A fake server: patches and ticks change `served`, as the real one does. Returns the setDone spy. */
function serveWrites() {
  patchTask.mockImplementation(async (id: string, changes: Partial<Task>) => {
    served.tasks = served.tasks.map((t) => (t.id === id ? { ...t, ...changes } : t))
    return served.tasks.find((t) => t.id === id)!
  })
  return vi.spyOn(api, 'setDone').mockImplementation(async (id: string, done: boolean) => {
    served.tasks = served.tasks.map((t) =>
      t.id === id
        ? { ...t, status: done ? 'done' : 'not_started', completed_at: done ? new Date().toISOString() : null, updated_at: new Date().toISOString() }
        : t,
    )
    return served.tasks.find((t) => t.id === id)!
  })
}

const banner = () => screen.getByRole('region', { name: 'Picking for today' })
const card = (title: string) => screen.getByText(title).closest<HTMLElement>('[data-task-id]')!

beforeEach(() => {
  resetApp()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 13, 10, 0))
  vi.stubGlobal('EventSource', FakeEventSource)
  getState = vi.spyOn(api, 'getState').mockImplementation(async () => structuredClone(served))
  patchTask = vi.spyOn(api, 'patchTask').mockResolvedValue(makeTask({ id: 'x', title: 'x' }))
  logPlanning = vi.spyOn(api, 'logPlanning').mockResolvedValue({ dates: [TODAY] })
  ui.view = 'grid'
  ui.picking = false
  ui.openTaskId = null
  ui.contextMenu = null
  ui.modal = null
  user = userEvent.setup()
})
afterEach(() => {
  release?.()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  clearToast()
})

describe('Picking mode', () => {
  test('Plan today shows the banner on the Grid', async () => {
    await renderApp({ tasks: unpinned(), picking: false })
    expect(screen.queryByRole('region', { name: 'Picking for today' })).toBeNull()
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Plan today' }))
    expect(banner().textContent?.replace(/\s+/g, ' ').trim()).toContain(BANNER(0))
    expect(within(banner()).getByRole('button', { name: 'Done planning' })).toBeInTheDocument()
    // The Grid is still there, and Plan today is hidden while picking.
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Plan today' })).toBeNull()
  })

  test("clicking a card pins it and doesn't open the pop-up", async () => {
    await renderApp()
    await user.click(screen.getByText('Chase Sam re: sensor access'))
    expect(patchTask).toHaveBeenCalledWith('t3', { planned_for: TODAY })
    expect(ui.openTaskId).toBeNull()
  })

  test('clicking a picked card unpins it', async () => {
    await renderApp()
    await user.click(screen.getByText('Finish pilot interim report'))
    expect(patchTask).toHaveBeenCalledWith('t1', { planned_for: null })
    expect(ui.openTaskId).toBeNull()
  })

  test('Enter on a focused card toggles its pin; Delete does nothing', async () => {
    const del = vi.spyOn(api, 'deleteTask').mockResolvedValue(undefined)
    await renderApp()
    const c = card('Chase Sam re: sensor access')
    await fireEvent.keyDown(c, { key: 'Enter' })
    expect(patchTask).toHaveBeenCalledWith('t3', { planned_for: TODAY })
    expect(ui.openTaskId).toBeNull()
    patchTask.mockClear()
    await fireEvent.keyDown(c, { key: 'Delete' })
    await tick()
    expect(del).not.toHaveBeenCalled()
    expect(patchTask).not.toHaveBeenCalled()
    expect(screen.getByText('Chase Sam re: sensor access')).toBeInTheDocument()
  })

  test('tick box still ticks in picking mode', async () => {
    const setDone = vi.spyOn(api, 'setDone').mockResolvedValue(fixtureState().tasks[2])
    await renderApp()
    await user.click(screen.getByRole('checkbox', { name: 'Chase Sam re: sensor access' }))
    expect(setDone).toHaveBeenCalledWith('t3', true)
    expect(patchTask).not.toHaveBeenCalled()
  })

  test('every card shows a pin; picked cards are marked', async () => {
    await renderApp()
    for (const title of ['Finish pilot interim report', 'Chase Sam re: sensor access']) {
      expect(card(title).querySelector('.pin-btn')).toBeInTheDocument()
    }
    expect(card('Finish pilot interim report')).toHaveClass('picked')
    expect(card('Chase Sam re: sensor access')).not.toHaveClass('picked')
  })

  test('count follows open picks', async () => {
    await renderApp({
      tasks: [
        makeTask({ id: 'a', title: 'Open one', planned_for: TODAY }),
        makeTask({ id: 'b', title: 'Open two', planned_for: TODAY, task_type: 'quick' }),
        makeTask({ id: 'c', title: 'Done one', planned_for: TODAY, status: 'done', completed_at: new Date().toISOString() }),
        makeTask({ id: 'd', title: 'Not pinned' }),
      ],
    })
    expect(banner().textContent?.replace(/\s+/g, ' ')).toContain(BANNER(2))
  })

  test('drag, + add and the context menu are off', async () => {
    await renderApp()
    const cards = document.querySelectorAll('[data-task-id]')
    expect(cards.length).toBeGreaterThan(0)
    expect(document.querySelectorAll('[data-task-id][draggable="true"]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '+ add' })).toBeNull()
    await fireEvent.contextMenu(card('Chase Sam re: sensor access'))
    expect(ui.contextMenu).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('notes are visible but read-only while picking', async () => {
    await renderApp()
    const notes = screen.getAllByRole('textbox', { name: 'Notes' })
    const p1 = notes.find((n) => (n as HTMLTextAreaElement).value === 'Sam: firewall change needs IT ticket')
    expect(p1).toBeDefined()
    for (const n of notes) expect(n).toHaveAttribute('readonly')
  })

  test('Done planning goes to Today and logs the day', async () => {
    await renderApp()
    await user.click(screen.getByRole('button', { name: 'Done planning' }))
    await waitFor(() => expect(logPlanning).toHaveBeenCalledTimes(1))
    expect(logPlanning).toHaveBeenCalledWith(TODAY)
    expect(ui.view).toBe('today')
    expect(ui.picking).toBe(false)
    expect(screen.queryByRole('region', { name: 'Picking for today' })).toBeNull()
  })

  test('Escape ends picking the same way', async () => {
    await renderApp()
    await fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(logPlanning).toHaveBeenCalledWith(TODAY))
    expect(ui.view).toBe('today')
    expect(ui.picking).toBe(false)
  })

  test('Escape while the pop-up or a menu is open does not end picking', async () => {
    await renderApp()
    ui.openTaskId = 't1'
    await tick()
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(ui.picking).toBe(true)
    ui.openTaskId = null

    ui.modal = 'settings'
    await tick()
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(ui.picking).toBe(true)
    ui.modal = null

    // The project header menu still opens; its Escape closes only the menu.
    await fireEvent.contextMenu(screen.getByRole('columnheader', { name: /Twin Pilot/ }))
    await tick()
    expect(ui.contextMenu).not.toBeNull()
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(ui.contextMenu).toBeNull()
    expect(ui.picking).toBe(true)
    expect(ui.view).toBe('grid')
    expect(logPlanning).not.toHaveBeenCalled()
  })

  test('leaving with no open picks does not log', async () => {
    // The only pin for today is done: it is not a pick.
    await renderApp({
      tasks: [
        ...unpinned().filter((t) => t.id !== 't1'),
        makeTask({ id: 'd', title: 'Done one', planned_for: TODAY, status: 'done', completed_at: new Date().toISOString() }),
      ],
    })
    const calls = getState.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Done planning' }))
    expect(ui.view).toBe('today')
    expect(ui.picking).toBe(false)
    // Leaving reloads the state before it counts: wait for that, then for the count.
    await waitFor(() => expect(getState).toHaveBeenCalledTimes(calls + 1))
    await endPickingSettled()
    expect(logPlanning).not.toHaveBeenCalled()
  })

  test('a pick that is ticked done no longer counts, and leaving does not log', async () => {
    const setDone = serveWrites()
    await renderApp({ tasks: unpinned() })
    await user.click(screen.getByText('Chase Sam re: sensor access'))
    await waitFor(() => expect(banner().textContent?.replace(/\s+/g, ' ')).toContain(BANNER(1)))
    await user.click(screen.getByRole('checkbox', { name: 'Chase Sam re: sensor access' }))
    expect(setDone).toHaveBeenCalledWith('t3', true)
    await waitFor(() => expect(banner().textContent?.replace(/\s+/g, ' ')).toContain(BANNER(0)))
    const calls = getState.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Done planning' }))
    await waitFor(() => expect(getState).toHaveBeenCalledTimes(calls + 1))
    await endPickingSettled()
    expect(logPlanning).not.toHaveBeenCalled()
  })

  test('a pick still on its way when leaving is counted once it lands', async () => {
    patchTask.mockImplementation(
      (id: string, changes: Partial<Task>) =>
        new Promise((resolve) => {
          release = () => {
            release = undefined
            served.tasks = served.tasks.map((t) => (t.id === id ? { ...t, ...changes } : t))
            resolve(served.tasks.find((t) => t.id === id)!)
          }
        }),
    )
    await renderApp({ tasks: unpinned() })
    await user.click(screen.getByText('Chase Sam re: sensor access'))
    await waitFor(() => expect(patchTask).toHaveBeenCalledWith('t3', { planned_for: TODAY }))
    await user.click(screen.getByRole('button', { name: 'Done planning' }))
    expect(ui.view).toBe('today')
    for (let i = 0; i < 5; i++) await tick()
    expect(logPlanning).not.toHaveBeenCalled()
    release!()
    await waitFor(() => expect(logPlanning).toHaveBeenCalledTimes(1))
    expect(logPlanning).toHaveBeenCalledWith(TODAY)
    await endPickingSettled()
    expect(logPlanning).toHaveBeenCalledTimes(1)
  })

  test('a done task that is still pinned is not marked picked', async () => {
    await renderApp({
      tasks: [
        makeTask({ id: 'a', title: 'Open one', planned_for: TODAY }),
        makeTask({ id: 'd', title: 'Done one', planned_for: TODAY, status: 'done', completed_at: new Date().toISOString() }),
      ],
    })
    expect(card('Open one')).toHaveClass('picked')
    expect(card('Done one')).not.toHaveClass('picked')
    // It is still pinned, so its pin stays dark.
    expect(card('Done one').querySelector('.pin-btn')).toHaveClass('on')
  })

  test('a drag that never ended does not swallow the next pick', async () => {
    await renderApp({ tasks: unpinned(), picking: false })
    await fireEvent.dragStart(card('Chase Sam re: sensor access'))
    // No dragend: the browser dropped it (for example, the drag left the window).
    ui.picking = true
    await tick()
    await user.click(screen.getByText('Chase Sam re: sensor access'))
    expect(patchTask).toHaveBeenCalledWith('t3', { planned_for: TODAY })
  })

  test('a drag that never ended does not swallow the next open click', async () => {
    await renderApp({ tasks: unpinned(), picking: false })
    await fireEvent.dragStart(card('Chase Sam re: sensor access'))
    await user.click(screen.getByText('Chase Sam re: sensor access'))
    expect(ui.openTaskId).toBe('t3')
  })

  test('half-typed + add text survives picking', async () => {
    await renderApp({ tasks: unpinned(), picking: false })
    const cell = card('Chase Sam re: sensor access').closest<HTMLElement>('[role=gridcell]')!
    await user.click(within(cell).getByRole('button', { name: '+ add' }))
    await user.type(within(cell).getByRole('textbox', { name: 'New task' }), 'Half typed')
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Plan today' }))
    expect(within(cell).queryByRole('textbox', { name: 'New task' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Grid' }))
    expect(ui.picking).toBe(false)
    expect(within(cell).getByRole('textbox', { name: 'New task' })).toHaveValue('Half typed')
  })

  test('clicking the Grid tab ends picking on the Grid and still logs', async () => {
    await renderApp()
    await user.click(screen.getByRole('button', { name: 'Grid' }))
    await waitFor(() => expect(logPlanning).toHaveBeenCalledWith(TODAY))
    expect(ui.picking).toBe(false)
    expect(ui.view).toBe('grid')
    expect(screen.queryByRole('region', { name: 'Picking for today' })).toBeNull()
  })

  test('Plan today on the empty Today view starts picking', async () => {
    await renderApp({ tasks: unpinned(), picking: false, view: 'today' })
    const empty = screen.getByText('Nothing picked for today').parentElement!
    await user.click(within(empty).getByRole('button', { name: 'Plan today' }))
    expect(ui.view).toBe('grid')
    expect(banner().textContent?.replace(/\s+/g, ' ')).toContain(BANNER(0))
  })

  test('log failure toasts but still shows Today', async () => {
    logPlanning.mockRejectedValue(new api.ApiError(422, 'planning log unreadable'))
    await renderApp()
    await user.click(screen.getByRole('button', { name: 'Done planning' }))
    await waitFor(() => expect(toast.current?.message).toBe("Couldn't record today's plan: planning log unreadable"))
    expect(ui.view).toBe('today')
    expect(ui.picking).toBe(false)
  })
})
