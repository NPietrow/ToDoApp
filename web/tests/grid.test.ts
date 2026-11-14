import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../src/App.svelte'
import appSource from '../src/App.svelte?raw'
import Grid from '../src/components/Grid.svelte'
import gridSource from '../src/components/Grid.svelte?raw'
import ProjectNameDialog from '../src/components/ProjectNameDialog.svelte'
import TopBar from '../src/components/TopBar.svelte'
import topBarSource from '../src/components/TopBar.svelte?raw'
import * as api from '../src/lib/api'
import { ApiError } from '../src/lib/api'
import { app } from '../src/lib/state.svelte'
import { clearToast, toast } from '../src/lib/toast.svelte'
import { FakeResizeObserver, fixtureState, makeProject, makeTask, resetApp } from './fixtures'

class FakeEventSource {
  static last: FakeEventSource | null = null
  close = vi.fn()
  constructor(public url: string) {
    FakeEventSource.last = this
  }
  addEventListener() {}
}

beforeEach(() => {
  resetApp()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  clearToast()
  document.documentElement.style.removeProperty('--base-size')
})

/** App mounts the event stream and fetches state: keep both off the network. */
function stubAppNetwork(state = fixtureState()) {
  vi.stubGlobal('EventSource', FakeEventSource)
  return vi.spyOn(api, 'getState').mockResolvedValue(state)
}

describe('Grid', () => {
  test('renders projects as columns and task types as rows in spec order', () => {
    render(Grid)
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())).toEqual([
      'Twin Pilot',
      'Data Platform',
    ])
    expect(screen.getAllByRole('rowheader').map((h) => h.textContent?.trim())).toEqual([
      'Urgent',
      'Quick',
      'General',
      'Objectives',
      'Notes',
    ])
  })

  test('today task is bold, blocked shows label, due chip formatted', () => {
    render(Grid)
    expect(screen.getByText('Finish pilot interim report').closest('[data-task-id]')).toHaveClass('pin')
    expect(screen.getByText('Blocked')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  test("yesterday's completed task hidden until Show completed is on", async () => {
    render(Grid)
    expect(screen.queryByText('Book site visit')).toBeNull()
    app.settings.show_completed = true
    await tick()
    expect(screen.getByText('Book site visit')).toBeInTheDocument()
  })

  test('accessibility hooks: scroll container, grid, labelled rows with their cells', () => {
    const { container } = render(Grid)
    const scroll = container.querySelector('.grid-scroll')
    expect(scroll).not.toBeNull()
    expect(within(scroll as HTMLElement).getByRole('grid')).toBeInTheDocument()

    const rows = screen.getAllByRole('row')
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      null, // the header row
      'Urgent',
      'Quick',
      'General',
      'Objectives',
      'Notes',
    ])
    for (const r of rows) expect(r).toHaveStyle({ display: 'contents' })

    const quick = screen.getByRole('row', { name: 'Quick' })
    expect(within(quick).getByRole('rowheader')).toHaveTextContent('Quick')
    const cells = within(quick).getAllByRole('gridcell')
    expect(cells).toHaveLength(2)
    expect(within(cells[0]).getByText('Chase Sam re: sensor access')).toBeInTheDocument()

    // The header row starts with an empty corner, then the project headers.
    expect(within(rows[0]).getAllByRole('columnheader')).toHaveLength(2)
    expect(rows[0].firstElementChild).not.toHaveAttribute('role', 'columnheader')
    expect(rows[0].firstElementChild).toBeEmptyDOMElement()
  })

  test('columns use the grid template, cells never scroll inside themselves', () => {
    const { container } = render(Grid)
    const grid = screen.getByRole('grid')
    expect(grid.getAttribute('style')).toContain(
      'grid-template-columns: calc(var(--label-w, 90px) + 16px) minmax(200px, 1fr) minmax(200px, 1fr)',
    )
    for (const cell of screen.getAllByRole('gridcell')) {
      expect(cell.style.overflow).toBe('')
      expect(cell.style.maxHeight).toBe('')
    }
    expect(container.querySelector('.grid-scroll')).not.toBeNull()
  })

  // jsdom doesn't apply Svelte's scoped CSS (getComputedStyle sees none of it), so check the
  // style text of the components that wrap the board instead.
  test('nothing around the board sets overflow: the page scrolls, not an inner area', () => {
    const { container } = render(Grid)
    const scroll = container.querySelector('.grid-scroll') as HTMLElement
    expect(scroll.getAttribute('style')).toBeNull()
    expect(scroll.style.overflow).toBe('')
    for (const source of [gridSource, appSource, topBarSource]) {
      const css = source.slice(source.indexOf('<style>'))
      expect(css).not.toMatch(/overflow(-x|-y)?\s*:\s*(auto|scroll)/)
    }
    expect(appSource).not.toMatch(/height:\s*100vh/)
    // fit-content, not max-content: max-content stretches the 1fr tracks to unwrapped titles.
    expect(appSource).toMatch(/width:\s*fit-content/)
    expect(appSource).not.toMatch(/width:\s*max-content/)
  })

  test('tasks in a cell are sorted by order', () => {
    app.tasks.push(
      makeTask({ id: 't9', title: 'Second in Urgent', task_type: 'urgent', order: 5 }),
      makeTask({ id: 't8', title: 'Before the report', task_type: 'urgent', order: -1 }),
    )
    render(Grid)
    const urgent = screen.getByRole('row', { name: 'Urgent' })
    const first = within(urgent).getAllByRole('gridcell')[0]
    expect([...first.querySelectorAll('[data-task-id]')].map((e) => e.getAttribute('data-task-id'))).toEqual([
      't8',
      't1',
      't9',
    ])
  })

  test('unsorted tasks and closed projects are not shown', () => {
    app.projects.push(makeProject({ id: 'p3', name: 'Old Bid', status: 'closed', position: 2 }))
    app.tasks.push(
      makeTask({ id: 'u1', title: 'Unsorted thing', project_id: null }),
      makeTask({ id: 'u2', title: 'Orphaned thing', project_id: 'gone' }),
      makeTask({ id: 'c1', title: 'Closed project thing', project_id: 'p3' }),
    )
    render(Grid)
    expect(screen.queryByText('Old Bid')).toBeNull()
    expect(screen.queryByText('Unsorted thing')).toBeNull()
    expect(screen.queryByText('Orphaned thing')).toBeNull()
    expect(screen.queryByText('Closed project thing')).toBeNull()
  })

  test('a description shows the ≡ marker, and only then', () => {
    app.tasks[0].description = 'Draft is in SharePoint'
    render(Grid)
    const markers = screen.getAllByLabelText('has description')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toHaveTextContent('≡')
    expect(markers[0].closest('[data-task-id]')).toHaveAttribute('data-task-id', 't1')
  })

  test('the tick box reports done state', async () => {
    app.settings.show_completed = true
    render(Grid)
    const done = screen.getByText('Book site visit').closest('[data-task-id]') as HTMLElement
    expect(done).toHaveClass('done')
    expect(within(done).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
    const open = screen.getByText('Chase Sam re: sensor access').closest('[data-task-id]') as HTMLElement
    expect(open).not.toHaveClass('done')
    expect(within(open).getByRole('checkbox')).toHaveAttribute('aria-checked', 'false')
  })

  test('columns take their palette colours, with a fallback for an unknown colour', () => {
    app.projects[0].colour = 'not-a-colour' // Data Platform
    render(Grid)
    const [twin, data] = screen.getAllByRole('columnheader')
    expect(twin).toHaveStyle({ background: '#d6e8cd' }) // sage header
    expect(data).toHaveStyle({ background: '#d6e8cd' }) // falls back to sage
    const cell = within(screen.getByRole('row', { name: 'Urgent' })).getAllByRole('gridcell')[0]
    expect(cell).toHaveStyle({ background: '#e9f2e4' }) // sage tint
    expect(cell.style.getPropertyValue('--accent')).toBe('#7fb069')
  })

  test('titles render as text, never HTML', () => {
    app.tasks[0].title = '<img src=x onerror=alert(1)>'
    const { container } = render(Grid)
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  test('Notes row shows each project\'s notes as plain text with links', () => {
    app.notes = { p1: 'line one\n- see https://example.com/doc.\n<b>x</b>', p2: '' }
    render(Grid)
    const notes = within(screen.getByRole('row', { name: 'Notes' })).getAllByRole('gridcell')
    expect(notes).toHaveLength(2)
    expect(notes[0].textContent).toContain('line one\n- see https://example.com/doc.\n<b>x</b>')
    const link = within(notes[0]).getByRole('link')
    expect(link).toHaveAttribute('href', 'https://example.com/doc')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(notes[0].querySelector('b')).toBeNull()
    expect(notes[1].textContent?.trim()).toBe('')
  })
})

describe('App', () => {
  test('empty state when no active projects', () => {
    stubAppNetwork({ ...fixtureState(), projects: [] })
    app.projects = []
    render(App)
    expect(screen.getByText('No projects yet')).toBeInTheDocument()
  })

  test('shows no empty state before the first load', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    let resolve!: (s: ReturnType<typeof fixtureState>) => void
    vi.spyOn(api, 'getState').mockReturnValue(new Promise((r) => (resolve = r)))
    app.loaded = false
    app.projects = []
    render(App)
    expect(screen.queryByText('No projects yet')).toBeNull()
    expect(screen.queryByRole('grid')).toBeNull()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    // Settle the fetch (refresh() holds a module-level lock until it does).
    resolve({ ...fixtureState(), projects: [] })
    expect(await screen.findByText('No projects yet')).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  test('loads state, then renders the Grid; unmount closes the event stream', async () => {
    const get = stubAppNetwork()
    app.loaded = false
    const { unmount } = render(App)
    expect(get).toHaveBeenCalledTimes(1)
    expect(FakeEventSource.last?.url).toBe('/api/events')
    expect(await screen.findByRole('grid')).toBeInTheDocument()
    unmount()
    expect(FakeEventSource.last?.close).toHaveBeenCalled()
  })

  test('applies the text size to the root element', async () => {
    stubAppNetwork({ ...fixtureState(), settings: { ...fixtureState().settings, text_size: 'large' } })
    render(App)
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--base-size')).toBe('14px'),
    )
    app.settings.text_size = 'small'
    await tick()
    expect(document.documentElement.style.getPropertyValue('--base-size')).toBe('11.5px')
    app.settings.text_size = 'medium'
    await tick()
    expect(document.documentElement.style.getPropertyValue('--base-size')).toBe('12.5px')
  })

  test('Create your first project opens the project name dialog', async () => {
    stubAppNetwork({ ...fixtureState(), projects: [] })
    app.projects = []
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Create your first project' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveFocus()
  })
})

describe('TopBar', () => {
  test('Grid tab is active, later views are disabled', () => {
    render(TopBar)
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-current', 'page')
    for (const name of ['Today', 'Kanban', 'Table', 'Stats']) {
      const b = screen.getByRole('button', { name })
      expect(b).toBeDisabled()
      expect(b).toHaveAttribute('title', 'Coming in a later stage')
    }
  })

  test('Show completed updates at once and persists', async () => {
    const patch = vi.spyOn(api, 'patchSettings').mockResolvedValue({ ...app.settings, show_completed: true })
    render(TopBar)
    const toggle = screen.getByRole('button', { name: 'Show completed' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(toggle)
    expect(app.settings.show_completed).toBe(true)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(patch).toHaveBeenCalledWith({ show_completed: true })
  })

  test('Show completed reverts and shows a toast when saving fails', async () => {
    vi.spyOn(api, 'patchSettings').mockRejectedValue(new ApiError(500, 'disk full'))
    render(TopBar)
    await fireEvent.click(screen.getByRole('button', { name: 'Show completed' }))
    await waitFor(() => expect(app.settings.show_completed).toBe(false))
    expect(toast.current?.message).toMatch(/Show completed/)
  })
})

describe('TopBar pinning', () => {
  test('publishes its height and the page width as CSS variables, and disconnects on destroy', () => {
    const root = document.documentElement
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(52)
    const { unmount } = render(TopBar)
    expect(root.style.getPropertyValue('--topbar-h')).toBe('52px')
    expect(root.style.getPropertyValue('--vw')).toBe(`${root.clientWidth}px`)

    const [observer] = FakeResizeObserver.instances
    expect(observer.observed).toContain(screen.getByRole('banner'))
    expect(observer.observed).toContain(root)

    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80)
    observer.callback()
    expect(root.style.getPropertyValue('--topbar-h')).toBe('80px')

    unmount()
    expect(observer.disconnect).toHaveBeenCalled()
    root.style.removeProperty('--topbar-h')
    root.style.removeProperty('--vw')
  })
})

describe('TopBar width follows the window', () => {
  test('a window resize republishes --vw, and the listener goes on destroy', () => {
    const root = document.documentElement
    const width = vi.spyOn(root, 'clientWidth', 'get').mockReturnValue(1351)
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(TopBar)
    expect(root.style.getPropertyValue('--vw')).toBe('1351px')

    width.mockReturnValue(985)
    window.dispatchEvent(new Event('resize'))
    expect(root.style.getPropertyValue('--vw')).toBe('985px')

    unmount()
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    width.mockReturnValue(500)
    window.dispatchEvent(new Event('resize'))
    expect(root.style.getPropertyValue('--vw')).toBe('985px')
    root.style.removeProperty('--topbar-h')
    root.style.removeProperty('--vw')
  })
})

describe('ProjectNameDialog', () => {
  test('Enter creates the project, then closes and refreshes', async () => {
    const create = vi
      .spyOn(api, 'createProject')
      .mockResolvedValue(makeProject({ id: 'p9', name: 'Line 4 Bid' }))
    const get = vi.spyOn(api, 'getState').mockResolvedValue(fixtureState())
    const onClose = vi.fn()
    render(ProjectNameDialog, { mode: 'create', position: 0, onClose })
    const input = screen.getByRole('textbox', { name: 'Project name' })
    await fireEvent.input(input, { target: { value: '  Line 4 Bid  ' } })
    await fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(create).toHaveBeenCalledWith('Line 4 Bid', 0)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(get).toHaveBeenCalled()
  })

  test('a blank name is ignored', async () => {
    const create = vi.spyOn(api, 'createProject')
    render(ProjectNameDialog, { mode: 'create', onClose: vi.fn() })
    const input = screen.getByRole('textbox', { name: 'Project name' })
    await fireEvent.input(input, { target: { value: '   ' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(create).not.toHaveBeenCalled()
  })

  test('shows the server error inline and stays open', async () => {
    vi.spyOn(api, 'createProject').mockRejectedValue(
      new ApiError(409, "A project called 'Twin Pilot' already exists"),
    )
    const onClose = vi.fn()
    render(ProjectNameDialog, { mode: 'create', onClose })
    const input = screen.getByRole('textbox', { name: 'Project name' })
    await fireEvent.input(input, { target: { value: 'Twin Pilot' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText("A project called 'Twin Pilot' already exists")).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('Escape and Cancel close without creating', async () => {
    const create = vi.spyOn(api, 'createProject')
    const onClose = vi.fn()
    render(ProjectNameDialog, { mode: 'create', onClose })
    await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Project name' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(create).not.toHaveBeenCalled()
  })
})
