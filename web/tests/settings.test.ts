import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../src/App.svelte'
import ProblemsList from '../src/components/ProblemsList.svelte'
import SettingsModal from '../src/components/SettingsModal.svelte'
import TopBar from '../src/components/TopBar.svelte'
import UnsortedTray from '../src/components/UnsortedTray.svelte'
import * as api from '../src/lib/api'
import { ApiError } from '../src/lib/api'
import { app } from '../src/lib/state.svelte'
import { clearToast } from '../src/lib/toast.svelte'
import { ui } from '../src/lib/ui.svelte'
import { fixtureState, makeProject, makeTask, resetApp } from './fixtures'

let user: ReturnType<typeof userEvent.setup>
let serverState: ReturnType<typeof fixtureState>

beforeEach(() => {
  resetApp()
  ui.modal = null
  user = userEvent.setup()
  serverState = fixtureState()
  vi.spyOn(api, 'getState').mockImplementation(async () => structuredClone(serverState))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearToast()
  ui.modal = null
})

describe('settings', () => {
  test('Large text size sets --base-size and saves', async () => {
    const patch = vi.spyOn(api, 'patchSettings').mockImplementation(async (ch) => {
      serverState.settings = { ...serverState.settings, ...ch }
      return serverState.settings
    })
    vi.stubGlobal('EventSource', class { addEventListener() {} close() {} })
    ui.modal = 'settings'
    render(App)
    await user.click(await screen.findByRole('button', { name: 'Large' }))
    expect(patch).toHaveBeenCalledWith({ text_size: 'large' })
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--base-size')).toBe('14px'),
    )
  })

  test('Start when I log in is absent unless this is the Windows app', () => {
    render(SettingsModal)
    expect(screen.queryByLabelText('Start when I log in')).toBeNull()
  })

  test('Start when I log in persists when present', async () => {
    app.windows_app = true
    const patch = vi.spyOn(api, 'patchSettings').mockResolvedValue(app.settings)
    render(SettingsModal)
    await user.click(screen.getByLabelText('Start when I log in'))
    expect(patch).toHaveBeenCalledWith({ start_at_login: true })
  })

  test('Use this folder shows the server message inline', async () => {
    app.settings.data_dir = 'C:/data'
    vi.spyOn(api, 'patchSettings').mockRejectedValue(new ApiError(422, 'Folder does not exist'))
    render(SettingsModal)
    const field = screen.getByRole('textbox', { name: 'Data folder' })
    await user.clear(field)
    await user.type(field, 'C:/nope')
    await user.click(screen.getByRole('button', { name: 'Use this folder' }))
    expect(await screen.findByText('Folder does not exist')).toBeInTheDocument()
  })

  test('Use this folder patches data_dir', async () => {
    const patch = vi.spyOn(api, 'patchSettings').mockResolvedValue(app.settings)
    render(SettingsModal)
    const field = screen.getByRole('textbox', { name: 'Data folder' })
    await user.clear(field)
    await user.type(field, 'D:/tasks')
    await user.click(screen.getByRole('button', { name: 'Use this folder' }))
    expect(patch).toHaveBeenCalledWith({ data_dir: 'D:/tasks' })
  })

  test('Reopen calls reopenProject', async () => {
    app.projects = [...app.projects, makeProject({ id: 'p3', name: 'Old Job', status: 'closed' })]
    const reopen = vi.spyOn(api, 'reopenProject').mockResolvedValue(app.projects[2])
    render(SettingsModal)
    expect(screen.getByText('Old Job')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(reopen).toHaveBeenCalledWith('p3')
  })

  test('Empty trash needs a confirm, then reports the count', async () => {
    const empty = vi.spyOn(api, 'emptyTrash').mockResolvedValue({ removed: 3 })
    render(SettingsModal)
    await user.click(screen.getByRole('button', { name: 'Empty trash' }))
    expect(empty).not.toHaveBeenCalled()
    expect(screen.getByText('Delete trashed tasks permanently?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(empty).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Empty trash' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(empty).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Removed 3')).toBeInTheDocument()
  })
})

describe('unsorted tray and badges', () => {
  test('badge counts open tasks with no active project, and assigning patches', async () => {
    app.tasks = [
      makeTask({ id: 'u1', title: 'Loose end', project_id: null }),
      makeTask({ id: 'u2', title: 'Done loose', project_id: null, status: 'done' }),
      makeTask({ id: 'u3', title: 'On closed', project_id: 'gone' }),
      makeTask({ id: 'ok', title: 'Fine', project_id: 'p1' }),
    ]
    app.projects = [...app.projects, makeProject({ id: 'gone', name: 'Gone', status: 'closed' })]
    const patch = vi.spyOn(api, 'patchTask').mockResolvedValue(app.tasks[0])
    const bar = render(TopBar)
    await user.click(screen.getByRole('button', { name: 'Unsorted (2)' }))
    expect(ui.modal).toBe('unsorted')
    bar.unmount()
    render(UnsortedTray)
    expect(screen.getByText('Loose end')).toBeInTheDocument()
    const selects = screen.getAllByRole('combobox')
    expect(selects).toHaveLength(2)
    await user.selectOptions(selects[0], 'Twin Pilot')
    expect(patch).toHaveBeenCalledWith('u1', { project_id: 'p1' })
  })

  test('badges are hidden at zero', () => {
    render(TopBar)
    expect(screen.queryByRole('button', { name: /Unsorted/ })).toBeNull()
    expect(screen.queryByText(/file problem/)).toBeNull()
  })

  test('problems badge text and list show file text as plain text', async () => {
    app.problems = [{ file: 'tasks/a.json', error: 'bad <b>json</b>' }]
    const bar = render(TopBar)
    await user.click(screen.getByRole('button', { name: '⚠ 1 file problem' }))
    expect(ui.modal).toBe('problems')
    bar.unmount()
    render(ProblemsList)
    expect(screen.getByText('tasks/a.json')).toBeInTheDocument()
    expect(screen.getByText('bad <b>json</b>')).toBeInTheDocument()
    expect(
      screen.getByText('Fix or remove these files in your data folder. Nothing has been changed.'),
    ).toBeInTheDocument()
  })

  test('plural problems, and the other buttons open their modals', async () => {
    app.problems = [
      { file: 'a', error: 'x' },
      { file: 'b', error: 'y' },
    ]
    render(TopBar)
    expect(screen.getByRole('button', { name: '⚠ 2 file problems' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Paste tasks' }))
    expect(ui.modal).toBe('paste')
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(ui.modal).toBe('settings')
  })
})
