export type Modal = 'paste' | 'settings' | 'unsorted' | 'problems'

export interface ContextMenu {
  x: number
  y: number
  kind: 'task' | 'project'
  id: string
}

export const ui: {
  openTaskId: string | null
  modal: Modal | null
  contextMenu: ContextMenu | null
} = $state({ openTaskId: null, modal: null, contextMenu: null })
