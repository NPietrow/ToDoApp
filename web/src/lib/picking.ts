// Picking mode: the morning planning session, run on the Grid. Leaving it with at least one
// open task pinned for today logs the day as planned.
import { logPlanning } from './api'
import { app, refresh } from './state.svelte'
import { showToast } from './toast.svelte'
import { todayTasks, todayWrites } from './today'
import { ui, type View } from './ui.svelte'

/** Plan today: go to the Grid in picking mode. */
export function startPicking(): void {
  ui.contextMenu = null
  ui.view = 'grid'
  ui.picking = true
}

/** Leave picking mode for `next`, logging the day if anything is picked. The view changes even if the log fails. */
export async function endPicking(next: View = 'today'): Promise<void> {
  ui.contextMenu = null
  ui.picking = false
  ui.view = next
  // A pick clicked just before leaving may still be on its way: count only once it has landed.
  await todayWrites(refresh)
  if (todayTasks(app.tasks, app.today).length === 0) return
  try {
    await logPlanning(app.today)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    showToast({ message: `Couldn't record today's plan: ${reason}` })
  }
}
