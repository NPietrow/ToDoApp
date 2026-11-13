// Collapsed columns and rows: saved in settings, applied at once, reverted if the save fails.
import { patchSettings } from './api'
import { app } from './state.svelte'
import { showToast } from './toast.svelte'
import type { RowKey } from './types'

type Lists = { collapsed_projects?: string[]; collapsed_rows?: RowKey[] }

async function save(next: Lists): Promise<void> {
  const prevProjects = app.settings.collapsed_projects
  const prevRows = app.settings.collapsed_rows
  if (next.collapsed_projects) app.settings.collapsed_projects = next.collapsed_projects
  if (next.collapsed_rows) app.settings.collapsed_rows = next.collapsed_rows
  try {
    await patchSettings(next)
  } catch {
    if (next.collapsed_projects) app.settings.collapsed_projects = prevProjects
    if (next.collapsed_rows) app.settings.collapsed_rows = prevRows
    showToast({ message: 'Could not save the collapsed columns and rows. Try again.' })
  }
}

export function toggleProject(id: string): Promise<void> {
  const list = app.settings.collapsed_projects
  return save({
    collapsed_projects: list.includes(id) ? list.filter((p) => p !== id) : [...list, id],
  })
}

export function toggleRow(key: RowKey): Promise<void> {
  const list = app.settings.collapsed_rows
  return save({ collapsed_rows: list.includes(key) ? list.filter((r) => r !== key) : [...list, key] })
}

export const expandAll = (): Promise<void> => save({ collapsed_projects: [], collapsed_rows: [] })

export const collapseAll = (ids: string[]): Promise<void> => save({ collapsed_projects: ids })
