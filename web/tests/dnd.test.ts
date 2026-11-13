import '@testing-library/jest-dom/vitest'
import '@testing-library/svelte/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import Grid from '../src/components/Grid.svelte'
import TaskItem from '../src/components/TaskItem.svelte'
import * as api from '../src/lib/api'
import { ApiError } from '../src/lib/api'
import { dropIndex } from '../src/lib/dnd'
import { app } from '../src/lib/state.svelte'
import { clearToast, toast } from '../src/lib/toast.svelte'
import { fixtureState, makeTask, resetApp, TASK } from './fixtures'

beforeEach(() => {
  resetApp()
  vi.spyOn(api, 'getState').mockResolvedValue(fixtureState())
})
afterEach(() => {
  vi.restoreAllMocks()
  clearToast()
})

/** A dataTransfer stand-in that remembers what dragstart stored. */
function makeDT() {
  const data: Record<string, string> = {}
  return {
    data,
    effectAllowed: '',
    dropEffect: '',
    get types() {
      return Object.keys(data)
    },
    setData: (t: string, v: string) => {
      data[t] = v
    },
    getData: (t: string) => data[t] ?? '',
  }
}

const card = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!
const cellOf = (id: string) => card(id).closest<HTMLElement>('[role="gridcell"]')!

/** Pretend every card in `el` is 20px tall, stacked from y=0. */
function layout(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('[data-task-id]').forEach((c, i) => {
    c.getBoundingClientRect = () =>
      ({ top: i * 20, bottom: i * 20 + 20, height: 20 }) as DOMRect
  })
}

/** jsdom has no DragEvent, so fireEvent drops clientY; build the event by hand. */
function dropAt(el: HTMLElement, dt: ReturnType<typeof makeDT>, clientY: number) {
  const ev = new Event('drop', { bubbles: true, cancelable: true })
  Object.assign(ev, { dataTransfer: dt, clientY })
  el.dispatchEvent(ev)
}

describe('dropIndex', () => {
  const cards = [
    { id: 'a', mid: 10 },
    { id: 'b', mid: 30 },
    { id: 'c', mid: 50 },
  ]
  test('counts visible cards above the pointer and maps to the full list', () => {
    expect(dropIndex(cards, ['a', 'b', 'c'], 0)).toBe(0)
    expect(dropIndex(cards, ['a', 'b', 'c'], 40)).toBe(2)
    expect(dropIndex(cards, ['a', 'b', 'c'], 99)).toBe(3)
  })
  test('a hidden done task between visible cards shifts the server index', () => {
    // full: a, hidden, b, c. Dropping between a and b means before b, which is position 2.
    expect(dropIndex(cards, ['a', 'h', 'b', 'c'], 20)).toBe(2)
    expect(dropIndex(cards, ['a', 'h', 'b', 'c'], 99)).toBe(4)
  })
  test('an empty cell gives the end of the full list', () => {
    expect(dropIndex([], [], 5)).toBe(0)
    expect(dropIndex([], ['h'], 5)).toBe(1)
  })
})

describe('drag and drop', () => {
  test('drops on another cell below its only card: moveTask(id, project, type, 1)', async () => {
    const move = vi.spyOn(api, 'moveTask').mockResolvedValue([])
    render(Grid)
    const dt = makeDT()
    const target = cellOf('t2')
    layout(target)
    await fireEvent.dragStart(card('t3'), { dataTransfer: dt })
    expect(dt.data['text/x-task-id']).toBe('t3')
    expect(dt.effectAllowed).toBe('move')
    dropAt(target, dt, 100)
    expect(move).toHaveBeenCalledWith('t3', 'p2', 'urgent', 1)
    await waitFor(() => expect(api.getState).toHaveBeenCalled())
  })

  test('dropping above the only card gives index 0', async () => {
    const move = vi.spyOn(api, 'moveTask').mockResolvedValue([])
    render(Grid)
    const dt = makeDT()
    const target = cellOf('t2')
    layout(target)
    await fireEvent.dragStart(card('t3'), { dataTransfer: dt })
    dropAt(target, dt, 1)
    expect(move).toHaveBeenCalledWith('t3', 'p2', 'urgent', 0)
  })

  test('reorders within a cell: first of three dropped below the second', async () => {
    app.tasks = [
      makeTask({ id: 'a', title: 'A', order: 0 }),
      makeTask({ id: 'b', title: 'B', order: 1 }),
      makeTask({ id: 'c', title: 'C', order: 2 }),
    ]
    const move = vi.spyOn(api, 'moveTask').mockResolvedValue([])
    render(Grid)
    const dt = makeDT()
    const target = cellOf('a')
    layout(target) // a 0-20, b 20-40, c 40-60; pointer at 45: below b's midpoint, above c's
    await fireEvent.dragStart(card('a'), { dataTransfer: dt })
    dropAt(target, dt, 45)
    expect(move).toHaveBeenCalledWith('a', 'p1', 'general', 1)
  })

  test('dropping a task onto its own position sends nothing', async () => {
    app.tasks = [
      makeTask({ id: 'a', title: 'A', order: 0 }),
      makeTask({ id: 'b', title: 'B', order: 1 }),
    ]
    const move = vi.spyOn(api, 'moveTask').mockResolvedValue([])
    render(Grid)
    const dt = makeDT()
    const target = cellOf('a')
    layout(target)
    await fireEvent.dragStart(card('a'), { dataTransfer: dt })
    dropAt(target, dt, 15) // above b's midpoint
    expect(move).not.toHaveBeenCalled()
  })

  test('a drag without task data is ignored', async () => {
    const move = vi.spyOn(api, 'moveTask').mockResolvedValue([])
    render(Grid)
    const dt = makeDT()
    const target = cellOf('t2')
    const over = new Event('dragover', { bubbles: true, cancelable: true })
    Object.assign(over, { dataTransfer: dt })
    target.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(false)
    dropAt(target, dt, 100)
    dt.setData('text/x-task-id', 'nope')
    dropAt(target, dt, 100)
    expect(move).not.toHaveBeenCalled()
  })

  test('dragover accepts a task drag and sets the move effect', async () => {
    render(Grid)
    const dt = makeDT()
    await fireEvent.dragStart(card('t3'), { dataTransfer: dt })
    const over = new Event('dragover', { bubbles: true, cancelable: true })
    Object.assign(over, { dataTransfer: dt })
    cellOf('t2').dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    expect(dt.dropEffect).toBe('move')
  })

  test('the outline shows on dragenter and clears on dragleave and on drop', async () => {
    vi.spyOn(api, 'moveTask').mockResolvedValue([])
    render(Grid)
    const dt = makeDT()
    const target = cellOf('t2')
    await fireEvent.dragStart(card('t3'), { dataTransfer: dt })
    await fireEvent.dragEnter(target, { dataTransfer: dt })
    expect(target).toHaveClass('over')
    // a child entered then the cell left: still over, until the last leave
    await fireEvent.dragEnter(card('t2'), { dataTransfer: dt })
    await fireEvent.dragLeave(target, { dataTransfer: dt })
    expect(target).toHaveClass('over')
    await fireEvent.dragLeave(card('t2'), { dataTransfer: dt })
    expect(target).not.toHaveClass('over')
    await fireEvent.dragEnter(target, { dataTransfer: dt })
    dropAt(target, dt, 100)
    await tick()
    expect(target).not.toHaveClass('over')
  })

  test('a failed move shows a toast', async () => {
    vi.spyOn(api, 'moveTask').mockRejectedValue(new ApiError(500, 'disk full'))
    render(Grid)
    const dt = makeDT()
    const target = cellOf('t2')
    layout(target)
    await fireEvent.dragStart(card('t3'), { dataTransfer: dt })
    dropAt(target, dt, 100)
    await waitFor(() => expect(toast.current?.message).toBe("Couldn't move task: disk full"))
  })

  test('the card is draggable but the tick box is not a drag handle', () => {
    render(TaskItem, { task: TASK })
    expect(card(TASK.id)).toHaveAttribute('draggable', 'true')
    expect(screen.getByRole('checkbox')).toHaveAttribute('draggable', 'false')
  })

  test('a drag that starts on the tick box is cancelled', () => {
    render(TaskItem, { task: TASK })
    const dt = makeDT()
    const ev = new Event('dragstart', { bubbles: true, cancelable: true })
    Object.assign(ev, { dataTransfer: dt })
    screen.getByRole('checkbox').dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(dt.data['text/x-task-id']).toBeUndefined()
  })
})
