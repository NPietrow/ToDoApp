import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import CloseProjectDialog from '../src/components/CloseProjectDialog.svelte'
import Grid from '../src/components/Grid.svelte'
import ProjectNameDialog from '../src/components/ProjectNameDialog.svelte'
import Toast from '../src/components/Toast.svelte'
import * as api from '../src/lib/api'
import { ApiError } from '../src/lib/api'
import { app } from '../src/lib/state.svelte'
import { clearToast, showToast, toast } from '../src/lib/toast.svelte'
import { ui } from '../src/lib/ui.svelte'
import { fixtureState, makeProject, makeTask, resetApp, TODAY } from './fixtures'

let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  resetApp()
  ui.contextMenu = null
  ui.openTaskId = null
  user = userEvent.setup()
  vi.spyOn(api, 'getState').mockResolvedValue(fixtureState())
})
afterEach(() => {
  vi.restoreAllMocks()
  clearToast()
})

/** Right-click: the contextmenu event with a position, as a mouse would send it. */
function rightClick(el: Element, clientX = 120, clientY = 80) {
  return fireEvent.contextMenu(el, { clientX, clientY })
}
const card = (title: string) => screen.getByText(title).closest('[data-task-id]') as HTMLElement
const labelsOf = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .filter((i) => i.closest('[role=menu]') === menu)
    .map((i) => i.textContent!.trim())
const rootLabels = () => labelsOf(screen.getAllByRole('menu')[0])

describe('task menu', () => {
  test('right-click shows the exact labels and suppresses the native menu', async () => {
    render(Grid)
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    card('Chase Sam re: sensor access').dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    await screen.findByRole('menu')
    expect(rootLabels()).toEqual(['Edit…', 'Move to ▸', 'Add to today', 'Set status ▸', 'Delete'])
    await user.click(screen.getByRole('menuitem', { name: 'Move to ▸' }))
    expect(labelsOf(screen.getAllByRole('menu')[1])).toEqual([
      'Urgent',
      'Quick',
      'General',
      'Objectives',
      'Project ▸',
    ])
    await user.click(screen.getByRole('menuitem', { name: 'Set status ▸' }))
    expect(labelsOf(screen.getAllByRole('menu')[1])).toEqual([
      'Not started',
      'In progress',
      'Blocked',
      'Done',
    ])
  })

  test('the native menu is not suppressed elsewhere in the grid', () => {
    render(Grid)
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    screen.getByRole('grid').dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })

  test('Edit… sets the open task id', async () => {
    render(Grid)
    await rightClick(card('Chase Sam re: sensor access'))
    await user.click(await screen.findByRole('menuitem', { name: 'Edit…' }))
    expect(ui.openTaskId).toBe('t3')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('Move to Urgent moves within the project to the end of the cell', async () => {
    const move = vi.spyOn(api, 'moveTask').mockResolvedValue([])
    render(Grid)
    await rightClick(card('Chase Sam re: sensor access'))
    await user.click(await screen.findByRole('menuitem', { name: 'Move to ▸' }))
    await user.click(screen.getByRole('menuitem', { name: 'Urgent' }))
    expect(move).toHaveBeenCalledWith('t3', 'p1', 'urgent', 1)
    await waitFor(() => expect(api.getState).toHaveBeenCalled())
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test("the task's current type is disabled and does nothing", async () => {
    const move = vi.spyOn(api, 'moveTask').mockResolvedValue([])
    render(Grid)
    await rightClick(card('Chase Sam re: sensor access'))
    await user.click(await screen.findByRole('menuitem', { name: 'Move to ▸' }))
    const quick = screen.getByRole('menuitem', { name: 'Quick' })
    expect(quick).toHaveAttribute('aria-disabled', 'true')
    await user.click(quick)
    expect(move).not.toHaveBeenCalled()
    expect(screen.getAllByRole('menu').length).toBeGreaterThan(0)
  })

  test('Move to Project keeps the task type and goes to the end of that cell', async () => {
    const move = vi.spyOn(api, 'moveTask').mockResolvedValue([])
    render(Grid)
    await rightClick(card('Finish pilot interim report'))
    await user.click(await screen.findByRole('menuitem', { name: 'Move to ▸' }))
    await user.click(screen.getByRole('menuitem', { name: 'Project ▸' }))
    expect(labelsOf(screen.getAllByRole('menu')[2])).toEqual(['Data Platform'])
    await user.click(screen.getByRole('menuitem', { name: 'Data Platform' }))
    expect(move).toHaveBeenCalledWith('t1', 'p2', 'urgent', 1) // t2 is already there
  })

  test('Add to today sets planned_for to today', async () => {
    const patch = vi.spyOn(api, 'patchTask').mockResolvedValue(makeTask({ id: 't3', title: 'x' }))
    render(Grid)
    await rightClick(card('Chase Sam re: sensor access'))
    await user.click(await screen.findByRole('menuitem', { name: 'Add to today' }))
    expect(patch).toHaveBeenCalledWith('t3', { planned_for: app.today })
    expect(app.today).toBe(TODAY)
  })

  test('Remove from today clears planned_for', async () => {
    const patch = vi.spyOn(api, 'patchTask').mockResolvedValue(makeTask({ id: 't1', title: 'x' }))
    render(Grid)
    await rightClick(card('Finish pilot interim report'))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from today' }))
    expect(patch).toHaveBeenCalledWith('t1', { planned_for: null })
  })

  test('Set status patches the status; the current one is disabled', async () => {
    const patch = vi.spyOn(api, 'patchTask').mockResolvedValue(makeTask({ id: 't3', title: 'x' }))
    render(Grid)
    await rightClick(card('Chase Sam re: sensor access'))
    await user.click(await screen.findByRole('menuitem', { name: 'Set status ▸' }))
    expect(screen.getByRole('menuitem', { name: 'Not started' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.click(screen.getByRole('menuitem', { name: 'In progress' }))
    expect(patch).toHaveBeenCalledWith('t3', { status: 'in_progress' })
  })

  test('a failed action toasts', async () => {
    vi.spyOn(api, 'patchTask').mockRejectedValue(new ApiError(500, 'disk full'))
    render(Grid)
    await rightClick(card('Chase Sam re: sensor access'))
    await user.click(await screen.findByRole('menuitem', { name: 'Add to today' }))
    await waitFor(() => expect(toast.current?.message).toMatch(/disk full/))
  })

  test('Delete toasts with Undo, and Undo restores then refreshes', async () => {
    const del = vi.spyOn(api, 'deleteTask').mockResolvedValue(undefined)
    const restore = vi
      .spyOn(api, 'restoreTask')
      .mockResolvedValue(makeTask({ id: 't3', title: 'x' }))
    render(Grid)
    render(Toast)
    await rightClick(card('Chase Sam re: sensor access'))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect(del).toHaveBeenCalledWith('t3')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Deleted "Chase Sam re: sensor access"',
    )
    vi.mocked(api.getState).mockClear()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(restore).toHaveBeenCalledWith('t3')
    await waitFor(() => expect(api.getState).toHaveBeenCalled())
  })

  test('a failed Undo shows its own toast, which survives', async () => {
    vi.spyOn(api, 'deleteTask').mockResolvedValue(undefined)
    vi.spyOn(api, 'restoreTask').mockRejectedValue(new ApiError(404, 'gone'))
    render(Grid)
    render(Toast)
    await rightClick(card('Chase Sam re: sensor access'))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(toast.current?.message).toMatch(/Couldn't restore.*gone/))
    expect(await screen.findByRole('status')).toHaveTextContent(/Couldn't restore/)
  })

  test('closes on an outside click and on Esc', async () => {
    render(Grid)
    await rightClick(card('Chase Sam re: sensor access'))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await user.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
    await rightClick(card('Chase Sam re: sensor access'))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('only one menu is open at a time', async () => {
    render(Grid)
    await rightClick(card('Chase Sam re: sensor access'))
    await screen.findByRole('menu')
    await rightClick(screen.getByRole('columnheader', { name: 'Twin Pilot' }))
    await waitFor(() => expect(rootLabels()).toContain('Rename'))
    expect(screen.getAllByRole('menu')).toHaveLength(1)
  })

  test('arrow keys move between items; ArrowRight opens a submenu', async () => {
    render(Grid)
    await rightClick(card('Chase Sam re: sensor access'))
    await screen.findByRole('menu')
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit…' })).toHaveFocus())
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Move to ▸' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Urgent' })).toHaveFocus())
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('menuitem', { name: 'Move to ▸' })).toHaveFocus()
    expect(screen.getAllByRole('menu')).toHaveLength(1)
  })

  test('ticking a card with its menu open is not blocked', async () => {
    const done = vi.spyOn(api, 'setDone').mockResolvedValue(makeTask({ id: 't1', title: 'x' }))
    render(Grid)
    await rightClick(card('Chase Sam re: sensor access'))
    await screen.findByRole('menu')
    await user.click(within(card('Finish pilot interim report')).getByRole('checkbox'))
    expect(done).toHaveBeenCalledWith('t1', true)
  })
})

describe('task keyboard', () => {
  test('cards are focusable; Enter on the card opens the task', async () => {
    render(Grid)
    const c = card('Chase Sam re: sensor access')
    expect(c).toHaveAttribute('tabindex', '0')
    c.focus()
    await user.keyboard('{Enter}')
    expect(ui.openTaskId).toBe('t3')
  })

  test('Enter on the tick box does not open the task', async () => {
    vi.spyOn(api, 'setDone').mockResolvedValue(makeTask({ id: 't3', title: 'x' }))
    render(Grid)
    within(card('Chase Sam re: sensor access')).getByRole('checkbox').focus()
    await user.keyboard('{Enter}')
    expect(ui.openTaskId).toBeNull()
  })

  test('Delete on a focused card deletes it', async () => {
    const del = vi.spyOn(api, 'deleteTask').mockResolvedValue(undefined)
    render(Grid)
    card('Chase Sam re: sensor access').focus()
    await user.keyboard('{Delete}')
    expect(del).toHaveBeenCalledWith('t3')
    await waitFor(() =>
      expect(toast.current?.message).toBe('Deleted "Chase Sam re: sensor access"'),
    )
  })

  test('Shift+F10 and the ContextMenu key open the task menu', async () => {
    render(Grid)
    card('Chase Sam re: sensor access').focus()
    await user.keyboard('{Shift>}{F10}{/Shift}')
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(card('Chase Sam re: sensor access')).toHaveFocus()
    await user.keyboard('{ContextMenu}')
    expect(await screen.findByRole('menu')).toBeInTheDocument()
  })
})

describe('project header menu', () => {
  const header = (name: string) => screen.getByRole('columnheader', { name })

  test('shows the exact labels and 10 colour swatches', async () => {
    render(Grid)
    await rightClick(header('Twin Pilot'))
    await screen.findByRole('menu')
    expect(rootLabels()).toEqual([
      'Insert project left',
      'Insert project right',
      'Move left',
      'Move right',
      'Rename',
      'Change colour ▸',
      'Close project',
    ])
    expect(screen.getByRole('menuitem', { name: 'Close project' })).toHaveClass('danger')
    expect(screen.getByRole('menuitem', { name: 'Rename' })).not.toHaveClass('danger')
    await user.click(screen.getByRole('menuitem', { name: 'Change colour ▸' }))
    const sub = screen.getAllByRole('menu')[1]
    expect(within(sub).getAllByRole('menuitem')).toHaveLength(10)
    expect(within(sub).getByRole('menuitem', { name: 'sage' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  test('left-click on the name still collapses', async () => {
    vi.spyOn(api, 'patchSettings').mockImplementation(async (c) => ({ ...app.settings, ...c }))
    render(Grid)
    await user.click(screen.getByRole('button', { name: 'Twin Pilot' }))
    expect(app.settings.collapsed_projects).toEqual(['p1'])
  })

  test('Insert project right on the first header creates at position 1', async () => {
    const create = vi
      .spyOn(api, 'createProject')
      .mockResolvedValue(makeProject({ id: 'p9', name: 'New' }))
    render(Grid)
    await rightClick(header('Twin Pilot'))
    await user.click(await screen.findByRole('menuitem', { name: 'Insert project right' }))
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'Line 4 Bid')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(create).toHaveBeenCalledWith('Line 4 Bid', 1)
  })

  test('Insert project left on the second header creates at position 1', async () => {
    const create = vi
      .spyOn(api, 'createProject')
      .mockResolvedValue(makeProject({ id: 'p9', name: 'New' }))
    render(Grid)
    await rightClick(header('Data Platform'))
    await user.click(await screen.findByRole('menuitem', { name: 'Insert project left' }))
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'X')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(create).toHaveBeenCalledWith('X', 1)
  })

  test('Move right moves to the next position; Move left is disabled on the first', async () => {
    const move = vi.spyOn(api, 'moveProject').mockResolvedValue([])
    render(Grid)
    await rightClick(header('Twin Pilot'))
    const left = await screen.findByRole('menuitem', { name: 'Move left' })
    expect(left).toHaveAttribute('aria-disabled', 'true')
    await user.click(left)
    expect(move).not.toHaveBeenCalled()
    await user.click(screen.getByRole('menuitem', { name: 'Move right' }))
    expect(move).toHaveBeenCalledWith('p1', 1)
  })

  test('Move right is disabled on the last header', async () => {
    render(Grid)
    await rightClick(header('Data Platform'))
    expect(await screen.findByRole('menuitem', { name: 'Move right' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  test('Change colour patches the project', async () => {
    const patch = vi
      .spyOn(api, 'patchProject')
      .mockResolvedValue(makeProject({ id: 'p1', name: 'x' }))
    render(Grid)
    await rightClick(header('Twin Pilot'))
    await user.click(await screen.findByRole('menuitem', { name: 'Change colour ▸' }))
    await user.click(screen.getByRole('menuitem', { name: 'peach' }))
    expect(patch).toHaveBeenCalledWith('p1', { colour: 'peach' })
  })

  test('Rename opens the dialog and patches the name', async () => {
    const patch = vi
      .spyOn(api, 'patchProject')
      .mockResolvedValue(makeProject({ id: 'p1', name: 'x' }))
    render(Grid)
    await rightClick(header('Twin Pilot'))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Project name' })
    expect(input).toHaveValue('Twin Pilot')
    await user.clear(input)
    await user.type(input, 'Twin Live')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    expect(patch).toHaveBeenCalledWith('p1', { name: 'Twin Live' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('renaming to a duplicate shows the 409 message', async () => {
    vi.spyOn(api, 'patchProject').mockRejectedValue(
      new ApiError(409, "A project called 'Data Platform' already exists"),
    )
    render(Grid)
    await rightClick(header('Twin Pilot'))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Project name' })
    await user.clear(input)
    await user.type(input, 'Data Platform')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    expect(
      await screen.findByText("A project called 'Data Platform' already exists"),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  test('Close project with open tasks asks first', async () => {
    const close = vi
      .spyOn(api, 'closeProject')
      .mockResolvedValue(makeProject({ id: 'p1', name: 'x' }))
    render(Grid)
    await rightClick(header('Twin Pilot'))
    await user.click(await screen.findByRole('menuitem', { name: 'Close project' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Twin Pilot has 2 open tasks.')
    expect(close).not.toHaveBeenCalled()
  })

  test('Close project with no open tasks closes directly', async () => {
    app.tasks = app.tasks.filter((t) => t.project_id !== 'p1' || t.status === 'done')
    const close = vi
      .spyOn(api, 'closeProject')
      .mockResolvedValue(makeProject({ id: 'p1', name: 'x' }))
    render(Grid)
    await rightClick(header('Twin Pilot'))
    await user.click(await screen.findByRole('menuitem', { name: 'Close project' }))
    expect(close).toHaveBeenCalledWith('p1', null)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('+ project creates at the end', async () => {
    const create = vi
      .spyOn(api, 'createProject')
      .mockResolvedValue(makeProject({ id: 'p9', name: 'New' }))
    render(Grid)
    await user.click(screen.getByRole('button', { name: '+ project' }))
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'Last')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(create).toHaveBeenCalledWith('Last', 2)
  })
})

describe('CloseProjectDialog', () => {
  test('Move and close moves open tasks to the chosen project', async () => {
    const close = vi
      .spyOn(api, 'closeProject')
      .mockResolvedValue(makeProject({ id: 'p1', name: 'x' }))
    const onClose = vi.fn()
    render(CloseProjectDialog, { projectId: 'p1', onClose })
    const select = screen.getByRole('combobox', { name: 'Move open tasks to…' })
    expect(select).toHaveValue('p2')
    await user.click(screen.getByRole('button', { name: 'Move and close' }))
    expect(close).toHaveBeenCalledWith('p1', 'p2')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.getState).toHaveBeenCalled()
  })

  test('Close anyway closes without moving', async () => {
    const close = vi
      .spyOn(api, 'closeProject')
      .mockResolvedValue(makeProject({ id: 'p1', name: 'x' }))
    render(CloseProjectDialog, { projectId: 'p1', onClose: vi.fn() })
    await user.click(screen.getByRole('button', { name: 'Close anyway' }))
    expect(close).toHaveBeenCalledWith('p1', null)
  })

  test('with no other active project the select and Move and close are hidden', () => {
    app.projects = app.projects.filter((p) => p.id === 'p1')
    render(CloseProjectDialog, { projectId: 'p1', onClose: vi.fn() })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move and close' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close anyway' })).toBeInTheDocument()
  })

  test('an error shows inline and the dialog stays open', async () => {
    vi.spyOn(api, 'closeProject').mockRejectedValue(new ApiError(500, 'disk full'))
    const onClose = vi.fn()
    render(CloseProjectDialog, { projectId: 'p1', onClose })
    await user.click(screen.getByRole('button', { name: 'Close anyway' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('disk full')
    expect(onClose).not.toHaveBeenCalled()
  })

  test('says "1 open task" for one', () => {
    render(CloseProjectDialog, { projectId: 'p2', onClose: vi.fn() })
    expect(screen.getByRole('dialog')).toHaveTextContent('Data Platform has 1 open task.')
  })
})

describe('dialog behaviour', () => {
  test('Escape closes only when pressed inside the dialog', async () => {
    const onClose = vi.fn()
    render(ProjectNameDialog, { mode: 'create', onClose })
    await fireEvent.keyDown(document.body, { key: 'Escape' })
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('Tab stays inside the dialog', async () => {
    render(ProjectNameDialog, { mode: 'create', onClose: vi.fn() })
    expect(screen.getByRole('textbox')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('textbox')).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Create' })).toHaveFocus()
  })

  test('focus returns to the previously focused element on close', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(ProjectNameDialog, { mode: 'create', onClose: vi.fn() })
    expect(opener).not.toHaveFocus()
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})

describe('Toast action', () => {
  test('the toast is cleared before its action runs, so a toast shown by the action survives', async () => {
    render(Toast)
    let seen: unknown = 'unset'
    showToast({
      message: 'Deleted "x"',
      actionLabel: 'Undo',
      onAction: () => {
        seen = toast.current
        showToast({ message: "Couldn't restore" })
      },
    })
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(seen).toBeNull()
    expect(toast.current?.message).toBe("Couldn't restore")
  })
})
