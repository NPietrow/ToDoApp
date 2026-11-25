import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import CardHarness from './CardHarness.svelte'
import AddLine from '../src/components/AddLine.svelte'
import Grid from '../src/components/Grid.svelte'
import TaskItem from '../src/components/TaskItem.svelte'
import Toast from '../src/components/Toast.svelte'
import * as api from '../src/lib/api'
import { ApiError } from '../src/lib/api'
import { clearToast, showToast, toast } from '../src/lib/toast.svelte'
import { fixtureState, resetApp, TASK } from './fixtures'

let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  resetApp()
  user = userEvent.setup()
  vi.spyOn(api, 'getState').mockResolvedValue(fixtureState())
})
afterEach(() => {
  vi.restoreAllMocks()
  clearToast()
})

async function openAdd() {
  render(AddLine, { projectId: 'p1', taskType: 'quick' })
  await user.click(screen.getByText('+ add'))
}

describe('AddLine', () => {
  test('Enter creates a task and keeps the input open and empty', async () => {
    const create = vi.spyOn(api, 'createTask').mockResolvedValue(TASK)
    await openAdd()
    await user.keyboard('Chase Sam{Enter}')
    expect(create).toHaveBeenCalledWith('Chase Sam', 'p1', 'quick')
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  test('refreshes after a successful create', async () => {
    vi.spyOn(api, 'createTask').mockResolvedValue(TASK)
    await openAdd()
    await user.keyboard('Chase Sam{Enter}')
    await waitFor(() => expect(api.getState).toHaveBeenCalled())
  })

  test('blank Enter creates nothing; Esc closes', async () => {
    const create = vi.spyOn(api, 'createTask')
    await openAdd()
    await user.keyboard('   {Enter}')
    expect(create).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  test('Esc discards typed text', async () => {
    await openAdd()
    await user.keyboard('half a thought{Escape}')
    expect(screen.queryByRole('textbox')).toBeNull()
    await user.click(screen.getByText('+ add'))
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  test('a failed create shows a toast and puts the text back', async () => {
    vi.spyOn(api, 'createTask').mockRejectedValue(new ApiError(500, 'disk full'))
    await openAdd()
    await user.keyboard('Chase Sam{Enter}')
    await waitFor(() => expect(toast.current?.message).toBe("Couldn't add task: disk full"))
    expect(screen.getByRole('textbox')).toHaveValue('Chase Sam')
  })

  test('a failed create does not overwrite what was typed meanwhile', async () => {
    let reject!: (e: Error) => void
    vi.spyOn(api, 'createTask').mockReturnValue(new Promise((_, r) => (reject = r)))
    await openAdd()
    await user.keyboard('First{Enter}Second')
    reject(new ApiError(500, 'nope'))
    await waitFor(() => expect(toast.current).not.toBeNull())
    expect(screen.getByRole('textbox')).toHaveValue('Second')
  })

  test('rapid Enter creates in typed order', async () => {
    const resolvers: Array<() => void> = []
    const create = vi.spyOn(api, 'createTask').mockImplementation(
      () => new Promise((resolve) => resolvers.push(() => resolve(TASK))),
    )
    await openAdd()
    await user.keyboard('one{Enter}two{Enter}')
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenNthCalledWith(1, 'one', 'p1', 'quick')
    // The second create must not start until the first has finished.
    await new Promise((r) => setTimeout(r, 20))
    expect(create).toHaveBeenCalledTimes(1)
    resolvers[0]()
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    expect(create).toHaveBeenNthCalledWith(2, 'two', 'p1', 'quick')
    resolvers[1]()
  })

  test('blur with text keeps the input open and the text', async () => {
    await openAdd()
    await user.keyboard('keep me')
    await user.tab()
    expect(screen.getByRole('textbox')).toHaveValue('keep me')
  })

  test('blur when empty closes the input', async () => {
    await openAdd()
    await user.tab()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('+ add')).toBeInTheDocument()
  })

  test('pasting multi-line rich text inserts a single plain line', async () => {
    await openAdd()
    const clip: Record<string, string> = {
      'text/plain': 'Line one\r\nLine two',
      'text/html': "<b style='font-size:30px'>Line one</b>",
    }
    await user.paste({ getData: (t: string) => clip[t] ?? '' } as unknown as DataTransfer)
    expect(screen.getByRole('textbox')).toHaveValue('Line one Line two')
  })

  test('the input is labelled "New task"', async () => {
    await openAdd()
    expect(screen.getByRole('textbox', { name: 'New task' })).toBeInTheDocument()
  })
})

describe('TaskItem ticking', () => {
  test('ticking calls setDone and refreshes', async () => {
    const done = vi.spyOn(api, 'setDone').mockResolvedValue({ ...TASK, status: 'done' })
    render(TaskItem, { task: TASK })
    await user.click(screen.getByRole('checkbox'))
    expect(done).toHaveBeenCalledWith(TASK.id, true)
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(api.getState).toHaveBeenCalled())
  })

  test('unticking a done task calls setDone(id, false)', async () => {
    const done = vi.spyOn(api, 'setDone').mockResolvedValue(TASK)
    render(TaskItem, { task: { ...TASK, status: 'done' } })
    await user.click(screen.getByRole('checkbox'))
    expect(done).toHaveBeenCalledWith(TASK.id, false)
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false')
  })

  test('a failed tick reverts and shows a toast', async () => {
    vi.spyOn(api, 'setDone').mockRejectedValue(new ApiError(500, 'disk full'))
    render(TaskItem, { task: TASK })
    await user.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false'))
    expect(toast.current?.message).toMatch(/disk full/)
  })

  test('the tick click does not bubble to the card', async () => {
    vi.spyOn(api, 'setDone').mockResolvedValue(TASK)
    const onCardClick = vi.fn()
    render(CardHarness, { task: TASK, onCardClick })
    await user.click(screen.getByRole('checkbox'))
    expect(onCardClick).not.toHaveBeenCalled()
    await user.click(screen.getByText('Chase Sam'))
    expect(onCardClick).toHaveBeenCalledTimes(1)
  })
})

describe('Grid wiring', () => {
  test('every project cell in the four task rows has a "+ add" line', () => {
    render(Grid)
    expect(screen.getAllByText('+ add')).toHaveLength(8) // 2 projects x 4 task types, not Notes
  })
})

describe('Toast', () => {
  test('renders the current toast message as text and can be dismissed', async () => {
    render(Toast)
    expect(screen.queryByRole('status')).toBeNull()
    showToast({ message: '<b>hi</b>' })
    expect(await screen.findByRole('status')).toHaveTextContent('<b>hi</b>')
    await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})
