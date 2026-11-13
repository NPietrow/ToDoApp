import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import Grid from '../src/components/Grid.svelte'
import TopBar from '../src/components/TopBar.svelte'
import * as api from '../src/lib/api'
import { ApiError } from '../src/lib/api'
import { app } from '../src/lib/state.svelte'
import { clearToast, toast } from '../src/lib/toast.svelte'
import { makeTask, resetApp } from './fixtures'

beforeEach(() => {
  resetApp()
})
afterEach(() => {
  vi.restoreAllMocks()
  clearToast()
})

/** Patch mock that echoes the change back, as the server would. */
function mockPatch() {
  return vi.spyOn(api, 'patchSettings').mockImplementation(async (c) => ({ ...app.settings, ...c }))
}

function rowCells(name: string) {
  return within(screen.getByRole('row', { name })).getAllByRole('gridcell')
}

describe('collapsing a column', () => {
  test('clicking the project name collapses it and saves', async () => {
    const patch = mockPatch()
    render(Grid)
    await fireEvent.click(screen.getByRole('button', { name: 'Twin Pilot' }))
    expect(patch).toHaveBeenCalledWith({ collapsed_projects: ['p1'] })
    expect(app.settings.collapsed_projects).toEqual(['p1'])
    // The strip shows the open count (t1 urgent + t3 quick; t4 is done) and the name.
    const strip = screen.getByRole('button', { name: 'Expand Twin Pilot' })
    expect(strip).toHaveTextContent('2')
    expect(strip).toHaveTextContent('Twin Pilot')
    expect(strip).toHaveStyle({ background: '#d6e8cd' })
    expect(screen.getByRole('grid').getAttribute('style')).toContain(
      'grid-template-columns: var(--label-w, 90px) 38px minmax(200px, 1fr)',
    )
  })

  test('the strip expands the column again', async () => {
    app.settings.collapsed_projects = ['p1']
    const patch = mockPatch()
    render(Grid)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand Twin Pilot' }))
    expect(patch).toHaveBeenCalledWith({ collapsed_projects: [] })
    expect(screen.queryByRole('button', { name: 'Expand Twin Pilot' })).toBeNull()
    expect(screen.getByRole('columnheader', { name: /Twin Pilot/ })).toBeInTheDocument()
  })

  test('a collapsed column has no cells, tasks or "+ add", and rows stay valid', () => {
    app.settings.collapsed_projects = ['p1']
    render(Grid)
    expect(screen.queryByText('Finish pilot interim report')).toBeNull()
    expect(screen.getAllByRole('columnheader')).toHaveLength(1)
    for (const row of ['Urgent', 'Quick', 'General', 'Objectives', 'Notes']) {
      expect(rowCells(row)).toHaveLength(1)
    }
    expect(within(screen.getByRole('row', { name: 'Urgent' })).getAllByText('+ add')).toHaveLength(1)
    // The strip sits in the header row and spans every row.
    const strip = screen.getByRole('button', { name: 'Expand Twin Pilot' })
    expect(strip.closest('[role="row"]')).toBe(screen.getAllByRole('row')[0])
    expect(strip.style.gridRow).toBe('1 / 7')
    expect(strip.style.gridColumn).toBe('2')
  })

  test('the header text is still just the name and contextmenu is not suppressed', async () => {
    render(Grid)
    const header = screen.getAllByRole('columnheader')[0]
    expect(header.textContent?.trim()).toBe('Twin Pilot')
    const notPrevented = await fireEvent.contextMenu(screen.getByRole('button', { name: 'Twin Pilot' }))
    expect(notPrevented).toBe(true)
  })

  test('ids that are not active projects are ignored and left alone', () => {
    app.settings.collapsed_projects = ['gone', 'p9']
    render(Grid)
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    expect(screen.getByRole('grid').getAttribute('style')).toContain(
      'var(--label-w, 90px) minmax(200px, 1fr) minmax(200px, 1fr)',
    )
    expect(app.settings.collapsed_projects).toEqual(['gone', 'p9'])
  })

  test('a failed save reverts to the previous value and shows a toast', async () => {
    app.settings.collapsed_projects = ['p2']
    vi.spyOn(api, 'patchSettings').mockRejectedValue(new ApiError(500, 'disk full'))
    render(Grid)
    await fireEvent.click(screen.getByRole('button', { name: 'Twin Pilot' }))
    await waitFor(() => expect(app.settings.collapsed_projects).toEqual(['p2']))
    expect(toast.current?.message).toMatch(/collapse/i)
  })
})

describe('collapsing a row', () => {
  beforeEach(() => {
    app.tasks.push(
      makeTask({ id: 'o1', title: 'Win phase 2', task_type: 'objective', project_id: 'p1' }),
      makeTask({ id: 'o2', title: 'Platform roadmap', task_type: 'objective', project_id: 'p2' }),
      makeTask({
        id: 'o3',
        title: 'Finished goal',
        task_type: 'objective',
        project_id: 'p2',
        status: 'done',
      }),
    )
  })

  test('clicking the label collapses it to "<n> open" bars and saves', async () => {
    const patch = mockPatch()
    render(Grid)
    await fireEvent.click(screen.getByRole('button', { name: 'Objectives' }))
    expect(patch).toHaveBeenCalledWith({ collapsed_rows: ['objective'] })
    expect(screen.getAllByText('1 open')).toHaveLength(2) // the done goal does not count
    expect(screen.queryByText('Win phase 2')).toBeNull()
    const cells = rowCells('Objectives')
    expect(cells).toHaveLength(2)
    expect(within(cells[0]).queryByText('+ add')).toBeNull()
    expect(screen.getByRole('row', { name: 'Objectives' })).toContainElement(
      screen.getByRole('rowheader', { name: 'Objectives' }),
    )
  })

  test('clicking a bar expands the row', async () => {
    app.settings.collapsed_rows = ['objective']
    const patch = mockPatch()
    render(Grid)
    await fireEvent.click(screen.getAllByText('1 open')[0])
    expect(patch).toHaveBeenCalledWith({ collapsed_rows: [] })
    expect(screen.getByText('Win phase 2')).toBeInTheDocument()
  })

  test('the Notes row shows a count of non-empty lines', () => {
    app.notes = { p1: 'one\n\n  \ntwo\nthree\n', p2: '' }
    app.settings.collapsed_rows = ['notes']
    render(Grid)
    const cells = rowCells('Notes')
    expect(cells[0]).toHaveTextContent('3 notes')
    expect(cells[1]).toHaveTextContent('0 notes')
  })

  test('a failed save reverts and shows a toast', async () => {
    vi.spyOn(api, 'patchSettings').mockRejectedValue(new ApiError(500, 'nope'))
    render(Grid)
    await fireEvent.click(screen.getByRole('button', { name: 'Objectives' }))
    await waitFor(() => expect(app.settings.collapsed_rows).toEqual([]))
    expect(toast.current).not.toBeNull()
  })

  test('a collapsed row hides "+ add" for every project', () => {
    app.settings.collapsed_rows = ['urgent']
    render(Grid)
    const urgent = within(screen.getByRole('row', { name: 'Urgent' }))
    expect(urgent.queryByText('+ add')).toBeNull()
    expect(within(screen.getByRole('row', { name: 'Quick' })).getAllByText('+ add')).toHaveLength(2)
  })
})

describe('Expand all / Collapse all', () => {
  test('Collapse all collapses every active project and leaves rows alone', async () => {
    app.settings.collapsed_rows = ['notes']
    const patch = mockPatch()
    render(TopBar)
    await fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(patch).toHaveBeenCalledTimes(1)
    expect(patch).toHaveBeenCalledWith({ collapsed_projects: ['p1', 'p2'] })
    expect(app.settings.collapsed_rows).toEqual(['notes'])
  })

  test('Expand all clears both lists in one call', async () => {
    app.settings.collapsed_projects = ['p1']
    app.settings.collapsed_rows = ['quick', 'notes']
    const patch = mockPatch()
    render(TopBar)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(patch).toHaveBeenCalledTimes(1)
    expect(patch).toHaveBeenCalledWith({ collapsed_projects: [], collapsed_rows: [] })
    expect(app.settings.collapsed_projects).toEqual([])
    expect(app.settings.collapsed_rows).toEqual([])
  })

  test('a failed Collapse all reverts to the captured previous lists', async () => {
    app.settings.collapsed_projects = ['gone']
    vi.spyOn(api, 'patchSettings').mockRejectedValue(new ApiError(500, 'nope'))
    render(TopBar)
    await fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
    await waitFor(() => expect(app.settings.collapsed_projects).toEqual(['gone']))
    expect(toast.current).not.toBeNull()
  })
})
