// Builds the task and project-header menus as plain data, and runs their actions. Every
// action ends with a refresh; a failure shows a toast instead.
import {
  closeProject,
  deleteTask,
  moveProject,
  moveTask,
  patchProject,
  patchTask,
  restoreTask,
} from './api'
import { isToday } from './dates'
import { PALETTE } from './palette'
import { refresh } from './state.svelte'
import { showToast } from './toast.svelte'
import { setPinned } from './today'
import { STATUS_LABELS, TASK_TYPES, type Project, type Status, type Task, type TaskType } from './types'

export type MenuItem = {
  label: string
  action?: () => void
  submenu?: MenuItem[]
  danger?: boolean
  disabled?: boolean
  /** A CSS colour drawn as a small square before the label. */
  swatch?: string
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Run an API call; refresh on success, toast "Couldn't <what>: <reason>" on failure. */
async function attempt(what: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    showToast({ message: `Couldn't ${what}: ${reason(err)}` })
    return
  }
  void refresh()
}

/** Delete a task and offer Undo for the toast's five seconds. */
export async function deleteWithUndo(task: Task): Promise<void> {
  try {
    await deleteTask(task.id)
  } catch (err) {
    showToast({ message: `Couldn't delete "${task.title}": ${reason(err)}` })
    return
  }
  showToast({
    message: `Deleted "${task.title}"`,
    actionLabel: 'Undo',
    onAction: () => void attempt(`restore "${task.title}"`, () => restoreTask(task.id)),
  })
  void refresh()
}

export interface TaskMenuContext {
  /** Active projects in position order. */
  projects: Project[]
  tasks: Task[]
  today: string
  openTask: (id: string) => void
}

export function taskMenuItems(task: Task, ctx: TaskMenuContext): MenuItem[] {
  /** The end of a cell, not counting the task itself. */
  const endOf = (projectId: string | null, type: TaskType) =>
    ctx.tasks.filter((t) => t.id !== task.id && t.project_id === projectId && t.task_type === type)
      .length
  const others = ctx.projects.filter((p) => p.id !== task.project_id)
  const today = isToday(task, ctx.today)

  return [
    { label: 'Edit…', action: () => ctx.openTask(task.id) },
    {
      label: 'Move to ▸',
      submenu: [
        ...TASK_TYPES.map((t) => ({
          label: t.label,
          disabled: t.key === task.task_type,
          action: () =>
            void attempt('move task', () =>
              moveTask(task.id, task.project_id, t.key, endOf(task.project_id, t.key)),
            ),
        })),
        {
          label: 'Project ▸',
          disabled: others.length === 0,
          submenu: others.map((p) => ({
            label: p.name,
            action: () =>
              void attempt('move task', () =>
                moveTask(task.id, p.id, task.task_type, endOf(p.id, task.task_type)),
              ),
          })),
        },
      ],
    },
    today
      ? {
          label: 'Remove from today',
          action: () => void setPinned(task, false, ctx.today),
        }
      : {
          label: 'Add to today',
          action: () => void setPinned(task, true, ctx.today),
        },
    {
      label: 'Set status ▸',
      submenu: (Object.keys(STATUS_LABELS) as Status[]).map((s) => ({
        label: STATUS_LABELS[s],
        disabled: s === task.status,
        action: () => void attempt('update task', () => patchTask(task.id, { status: s })),
      })),
    },
    { label: 'Delete', danger: true, action: () => void deleteWithUndo(task) },
  ]
}

export interface ProjectMenuHandlers {
  /** Open the create dialog to insert a project at this position. */
  insertAt: (position: number) => void
  rename: () => void
  /** Close the project, asking first if it has open tasks. */
  close: () => void
}

/** `index` is the project's place among the `count` active projects. */
export function projectMenuItems(
  project: Project,
  index: number,
  count: number,
  h: ProjectMenuHandlers,
): MenuItem[] {
  return [
    { label: 'Insert project left', action: () => h.insertAt(index) },
    { label: 'Insert project right', action: () => h.insertAt(index + 1) },
    {
      label: 'Move left',
      disabled: index === 0,
      action: () => void attempt('move project', () => moveProject(project.id, index - 1)),
    },
    {
      label: 'Move right',
      disabled: index >= count - 1,
      action: () => void attempt('move project', () => moveProject(project.id, index + 1)),
    },
    { label: 'Rename', action: h.rename },
    {
      label: 'Change colour ▸',
      submenu: Object.entries(PALETTE).map(([key, c]) => ({
        label: key,
        swatch: c.header,
        disabled: key === project.colour,
        action: () => void attempt('change colour', () => patchProject(project.id, { colour: key })),
      })),
    },
    { label: 'Close project', danger: true, action: h.close },
  ]
}

/** Close with no open tasks to deal with. */
export function closeProjectNow(id: string): Promise<void> {
  return attempt('close project', () => closeProject(id, null))
}
