// Dates are local calendar days held as 'YYYY-MM-DD' strings. All arithmetic goes through
// local Date objects built from parts: new Date('YYYY-MM-DD') would parse as UTC and drift.

import type { Task } from './types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number) => String(n).padStart(2, '0')

function toDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fromDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function localToday(now: Date = new Date()): string {
  return toDay(now)
}

export function addDays(day: string, n: number): string {
  const d = fromDay(day)
  d.setDate(d.getDate() + n)
  return toDay(d)
}

/** The next Monday strictly after `day`. */
export function nextMonday(day: string): string {
  const dow = fromDay(day).getDay() // 0 = Sunday
  return addDays(day, ((8 - dow) % 7) || 7)
}

/** The local calendar date of a UTC ISO datetime. */
export function localDateOf(iso: string): string {
  return toDay(new Date(iso))
}

/** Open tasks always show. Done tasks show for today, or for the last 14 days (including today) when asked. */
export function isVisibleOnGrid(t: Task, today: string, showCompleted: boolean): boolean {
  if (t.status !== 'done') return true
  if (t.completed_at === null) return true
  const done = localDateOf(t.completed_at)
  if (done === today) return true
  return showCompleted && done >= addDays(today, -13)
}

export function formatDue(due: string, today: string): string {
  if (due === today) return 'Today'
  if (due === addDays(today, 1)) return 'Tomorrow'
  const d = fromDay(due)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function isToday(t: Task, today: string): boolean {
  return t.planned_for === today
}
