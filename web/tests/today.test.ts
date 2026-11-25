import { expect, test } from 'vitest'
import { doneToday, longDate, todayTasks } from '../src/lib/today'
import { makeTask, TODAY, YESTERDAY_ISO } from './fixtures'

/** Midday on TODAY, local time, as the server's UTC ISO string. */
const at = (hour: number) => new Date(2026, 10, 13, hour, 0).toISOString()

test('todayTasks keeps only open tasks pinned today, in today_order', () => {
  const tasks = [
    makeTask({ id: 'b', title: 'B', planned_for: TODAY, today_order: 2 }),
    makeTask({ id: 'a', title: 'A', planned_for: TODAY, today_order: 1 }),
    makeTask({ id: 'other-day', title: 'X', planned_for: '2026-11-12', today_order: 0 }),
    makeTask({ id: 'unpinned', title: 'Y' }),
    makeTask({
      id: 'done',
      title: 'Z',
      planned_for: TODAY,
      today_order: 0,
      status: 'done',
      completed_at: at(9),
    }),
  ]
  expect(todayTasks(tasks, TODAY).map((t) => t.id)).toEqual(['a', 'b'])
})

test('todayTasks orders nulls and ties deterministically', () => {
  const tasks = [
    makeTask({ id: 'n', title: 'N', planned_for: TODAY, today_order: null, created_at: at(1) }),
    makeTask({ id: 'late', title: 'L', planned_for: TODAY, today_order: 1, created_at: at(8) }),
    makeTask({ id: 'early', title: 'E', planned_for: TODAY, today_order: 1, created_at: at(7) }),
    makeTask({ id: 'neg', title: 'M', planned_for: TODAY, today_order: -1, created_at: at(9) }),
  ]
  expect(todayTasks(tasks, TODAY).map((t) => t.id)).toEqual(['neg', 'early', 'late', 'n'])
  // Same order whatever order they arrive in.
  expect(todayTasks([...tasks].reverse(), TODAY).map((t) => t.id)).toEqual(['neg', 'early', 'late', 'n'])
})

test('doneToday needs pinned today and completed today', () => {
  const done = { status: 'done' as const, status_before_done: 'not_started' as const }
  const tasks = [
    makeTask({ id: 'second', title: 'A', planned_for: TODAY, ...done, completed_at: at(11) }),
    makeTask({ id: 'first', title: 'B', planned_for: TODAY, ...done, completed_at: at(9) }),
    makeTask({ id: 'not-pinned', title: 'C', ...done, completed_at: at(10) }),
    makeTask({ id: 'yesterday', title: 'D', planned_for: TODAY, ...done, completed_at: YESTERDAY_ISO }),
    makeTask({ id: 'open', title: 'E', planned_for: TODAY }),
  ]
  expect(doneToday(tasks, TODAY).map((t) => t.id)).toEqual(['first', 'second'])
})

test('longDate', () => {
  expect(longDate('2026-11-25')).toBe('Wednesday 25 November')
  expect(longDate(TODAY)).toBe('Friday 13 November')
})
