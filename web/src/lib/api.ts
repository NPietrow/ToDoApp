import type {
  AppState,
  ImportResult,
  PreviewResult,
  Project,
  ProjectChanges,
  Settings,
  Task,
  TaskChanges,
  TaskType,
} from './types'

export const eventsUrl = '/api/events'

/** True if the ToDoApp server answers at all; false when nothing is listening (it has stopped). */
export async function serverAnswers(): Promise<boolean> {
  try {
    await fetch('/api/health', { cache: 'no-store' })
    return true
  } catch {
    return false
  }
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** The server's `detail`: a string, or FastAPI's list of validation errors. */
function detailMessage(detail: unknown): string | null {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === 'object' ? (d as { msg?: unknown }).msg : undefined))
      .filter((m): m is string => typeof m === 'string')
    if (msgs.length) return msgs.join('; ')
  }
  return null
}

export interface RequestOptions {
  /** Let the request outlive the page: for the last save when the window closes (pagehide). */
  keepalive?: boolean
}

async function request<T>(method: string, path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  if (opts?.keepalive) init.keepalive = true
  const res = await fetch(path, init)
  if (!res.ok) {
    let message: string | null = null
    try {
      message = detailMessage((await res.json()).detail)
    } catch {
      // not JSON: fall through to the status text
    }
    throw new ApiError(res.status, message ?? (res.statusText || `HTTP ${res.status}`))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const enc = encodeURIComponent

export const getState = () => request<AppState>('GET', '/api/state')

export const createTask = (title: string, projectId: string | null, taskType: TaskType) =>
  request<Task>('POST', '/api/tasks', { title, project_id: projectId, task_type: taskType })

export const patchTask = (id: string, changes: TaskChanges, opts?: RequestOptions) =>
  request<Task>('PATCH', `/api/tasks/${enc(id)}`, changes, opts)

export const setDone = (id: string, done: boolean) =>
  request<Task>('POST', `/api/tasks/${enc(id)}/done`, { done })

/** projectId null moves the task to Unsorted. Resolves to the destination cell's tasks. */
export const moveTask = (id: string, projectId: string | null, taskType: TaskType, index: number) =>
  request<Task[]>('POST', `/api/tasks/${enc(id)}/move`, {
    project_id: projectId,
    task_type: taskType,
    index,
  })

/** Put `ids` first, in that order, on `date`'s Today list. Resolves to the day's open tasks. */
export const reorderToday = (date: string, ids: string[]) =>
  request<Task[]>('POST', '/api/today/reorder', { date, ids })

/** Record that `date` was planned (Plan today). Resolves to every planned day, oldest first. */
export const logPlanning = (date: string) => request<{ dates: string[] }>('POST', '/api/planning', { date })

export const deleteTask =(id: string) => request<void>('DELETE', `/api/tasks/${enc(id)}`)

export const restoreTask = (id: string) => request<Task>('POST', `/api/tasks/${enc(id)}/restore`)

export const emptyTrash = () => request<{ removed: number }>('POST', '/api/trash/empty')

export const createProject = (name: string, position?: number) =>
  request<Project>('POST', '/api/projects', { name, position: position ?? null })

export const patchProject = (id: string, changes: ProjectChanges) =>
  request<Project>('PATCH', `/api/projects/${enc(id)}`, changes)

export const moveProject = (id: string, position: number) =>
  request<Project[]>('POST', `/api/projects/${enc(id)}/move`, { position })

export const closeProject = (id: string, moveOpenTo: string | null) =>
  request<Project>('POST', `/api/projects/${enc(id)}/close`, { move_open_to: moveOpenTo ?? null })

export const reopenProject = (id: string) =>
  request<Project>('POST', `/api/projects/${enc(id)}/reopen`)

export const putNotes = (projectId: string, text: string, opts?: RequestOptions) =>
  request<void>('PUT', `/api/notes/${enc(projectId)}`, { text }, opts)

export const previewIntake = (text: string) =>
  request<PreviewResult>('POST', '/api/intake/preview', { text })

export const importIntake = (text: string) =>
  request<ImportResult>('POST', '/api/intake/import', { text })

export const patchSettings = (changes: Partial<Settings>) =>
  request<Settings>('PATCH', '/api/settings', changes)
