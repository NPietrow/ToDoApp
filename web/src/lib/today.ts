// The Today list: what's pinned for today, in the user's order, and what's been done from it.
import { patchTask } from './api'
import { localDateOf } from './dates'
import { serial } from './serial'
import { refresh } from './state.svelte'
import { showToast } from './toast.svelte'
import type { Task } from './types'

const byCreated = (a: Task, b: Task) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/** Open tasks pinned for `today`, by today_order (unset last), then created_at, then id. */
export function todayTasks(tasks: Task[], today: string): Task[] {
  return tasks
    .filter((t) => t.planned_for === today && t.status !== 'done')
    .sort((a, b) => {
      if (a.today_order !== b.today_order) {
        if (a.today_order === null) return 1
        if (b.today_order === null) return -1
        return a.today_order - b.today_order
      }
      return byCreated(a, b)
    })
}

/** Tasks pinned for `today` and completed today (local date), in the order they were done. */
export function doneToday(tasks: Task[], today: string): Task[] {
  return tasks
    .filter(
      (t) =>
        t.planned_for === today &&
        t.status === 'done' &&
        t.completed_at !== null &&
        localDateOf(t.completed_at) === today,
    )
    .sort((a, b) => (a.completed_at! < b.completed_at! ? -1 : a.completed_at! > b.completed_at! ? 1 : byCreated(a, b)))
}

const LONG_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

/** "Wednesday 25 November" for a 'YYYY-MM-DD' day. */
export function longDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  // en-GB puts a comma after the weekday in some engines: the design has none.
  return LONG_DATE.format(new Date(y, m - 1, d)).replace(',', '')
}

/** Today's pin and order writes, sent one at a time in the order they were made. */
export const todayWrites = serial()

/** Pin a task for today, or unpin it. The server places a new pin at the bottom of the list. */
export async function setPinned(task: Task, on: boolean, today: string): Promise<void> {
  try {
    await todayWrites(() => patchTask(task.id, { planned_for: on ? today : null }))
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    showToast({ message: `Couldn't update task: ${reason}` })
    return
  }
  await refresh()
}
