// Mirrors the server's JSON contract. Dates and datetimes are ISO strings.

export type TaskType = 'urgent' | 'quick' | 'general' | 'objective'
export type Status = 'not_started' | 'in_progress' | 'blocked' | 'done'

export const TASK_TYPES: readonly { key: TaskType; label: string }[] = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'quick', label: 'Quick' },
  { key: 'general', label: 'General' },
  { key: 'objective', label: 'Objectives' },
]

export const STATUS_LABELS: Record<Status, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}

export interface Task {
  schema_version: number
  id: string
  title: string
  description: string | null
  project_id: string | null
  task_type: TaskType
  status: Status
  status_before_done: Status | null
  due_date: string | null
  planned_for: string | null
  order: number
  today_order: number | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

/** The editable task fields; a key sent as null clears it, an absent key is left alone. */
export type TaskChanges = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'project_id'
    | 'task_type'
    | 'status'
    | 'due_date'
    | 'planned_for'
    | 'today_order'
  >
>

export interface Project {
  id: string
  name: string
  colour: string
  position: number
  status: 'active' | 'closed'
  created_at: string
  closed_at: string | null
}

export type ProjectChanges = Partial<Pick<Project, 'name' | 'colour'>>

export type TextSize = 'small' | 'medium' | 'large'
export type RowKey = TaskType | 'notes'

export interface Settings {
  data_dir: string
  port: number
  text_size: TextSize
  collapsed_projects: string[]
  collapsed_rows: RowKey[]
  show_completed: boolean
  start_at_login: boolean
}

export interface FileProblem {
  file: string
  error: string
}

export interface AppState {
  projects: Project[]
  tasks: Task[]
  /** Notes text keyed by project id. */
  notes: Record<string, string>
  problems: FileProblem[]
  settings: Settings
  windows_app: boolean
}

export interface PreviewItem {
  title: string
  project_id: string | null
  project_name: string | null
  task_type: TaskType
  due_date: string | null
}

export interface PreviewResult {
  items: PreviewItem[]
  errors: string[]
}

export interface ImportResult {
  imported: Task[]
  errors: string[]
}
