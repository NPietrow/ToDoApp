export type Modal = 'paste' | 'settings' | 'unsorted' | 'problems'
export type View = 'grid' | 'today'

export interface ContextMenu {
  x: number
  y: number
  kind: 'task' | 'project'
  id: string
}

export const ui: {
  /** The view on show. Not persisted: the app always opens on the Grid. */
  view: View
  /** Picking mode: clicks on Grid cards pin and unpin them for today. */
  picking: boolean
  openTaskId: string | null
  modal: Modal | null
  contextMenu: ContextMenu | null
} = $state({ view: 'grid', picking: false, openTaskId: null, modal: null, contextMenu: null })
