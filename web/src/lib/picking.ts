// Picking mode: the morning planning session, run on the Grid.
import { ui } from './ui.svelte'

/** Plan today: go to the Grid in picking mode. */
export function startPicking(): void {
  ui.contextMenu = null
  ui.view = 'grid'
  ui.picking = true
}
