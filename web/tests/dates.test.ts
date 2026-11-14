import { expect, test } from 'vitest'
import type { Task } from '../src/lib/types'
import {
  addDays,
  formatDue,
  formatShortDate,
  formatStamp,
  isToday,
  isVisibleOnGrid,
  localDateOf,
  localToday,
  monthGrid,
  nextMonday,
} from '../src/lib/dates'

const T = (o: Partial<Task>) =>
  ({ status: 'not_started', completed_at: null, planned_for: null, ...o }) as Task

test('visibility: open always, done today, done earlier only with toggle within 14 days', () => {
  expect(isVisibleOnGrid(T({}), '2026-11-13', false)).toBe(true)
  expect(isVisibleOnGrid(T({ status: 'done', completed_at: '2026-11-13T09:00:00Z' }), '2026-11-13', false)).toBe(true)
  expect(isVisibleOnGrid(T({ status: 'done', completed_at: '2026-11-12T09:00:00Z' }), '2026-11-13', false)).toBe(false)
  expect(isVisibleOnGrid(T({ status: 'done', completed_at: '2026-10-31T09:00:00Z' }), '2026-11-13', true)).toBe(true) // day 14
  expect(isVisibleOnGrid(T({ status: 'done', completed_at: '2026-10-30T09:00:00Z' }), '2026-11-13', true)).toBe(false) // day 15
})

test('a done task with no completed_at counts as completed today', () => {
  expect(isVisibleOnGrid(T({ status: 'done' }), '2026-11-13', false)).toBe(true)
})

test('nextMonday and formatDue', () => {
  expect(nextMonday('2026-11-13')).toBe('2026-11-16')
  expect(nextMonday('2026-11-16')).toBe('2026-11-23')
  expect(formatDue('2026-11-13', '2026-11-13')).toBe('Today')
  expect(formatDue('2026-11-20', '2026-11-13')).toBe('Fri 20 Nov')
})

test('formatDue Tomorrow', () => {
  expect(formatDue('2026-11-14', '2026-11-13')).toBe('Tomorrow')
  expect(formatDue('2026-12-01', '2026-11-30')).toBe('Tomorrow')
})

test('addDays crosses month, year and clock-change boundaries', () => {
  expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
  expect(addDays('2026-11-13', -13)).toBe('2026-10-31')
})

test('localToday uses local calendar parts', () => {
  expect(localToday(new Date(2026, 10, 13, 23, 59))).toBe('2026-11-13')
  expect(localToday(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
})

test('localDateOf converts a UTC instant to the local date', () => {
  const d = new Date(2026, 10, 13, 12, 0)
  expect(localDateOf(d.toISOString())).toBe('2026-11-13')
})

test('isToday compares planned_for', () => {
  expect(isToday(T({ planned_for: '2026-11-13' }), '2026-11-13')).toBe(true)
  expect(isToday(T({ planned_for: '2026-11-12' }), '2026-11-13')).toBe(false)
  expect(isToday(T({}), '2026-11-13')).toBe(false)
})

test('monthGrid lays a month out Monday-first in whole weeks', () => {
  const g = monthGrid(2026, 11) // 1 Nov 2026 is a Sunday
  expect(g[0][0]).toBe('2026-10-26')
  expect(g[0][6]).toBe('2026-11-01')
  expect(g.at(-1)![6]).toBe('2026-12-06')
  expect(g.every((w) => w.length === 7)).toBe(true)
  expect(monthGrid(2027, 2)[0][0]).toBe('2027-02-01') // a Monday start, no padding
})

test('formatShortDate and formatStamp use the local day and time', () => {
  const iso = new Date(2026, 10, 4, 9, 5).toISOString()
  expect(formatShortDate(iso)).toBe('4 Nov')
  expect(formatStamp(iso)).toBe('4 Nov 09:05')
})
