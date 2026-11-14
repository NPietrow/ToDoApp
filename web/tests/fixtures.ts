// Shared component-test state: two projects and four tasks, on a fixed "today".
import { vi } from 'vitest'
import { app } from '../src/lib/state.svelte'
import type { AppState, Project, Task } from '../src/lib/types'

export const TODAY = '2026-11-13'
/** Midday yesterday, local time, as the server's UTC ISO string. */
export const YESTERDAY_ISO = new Date(2026, 10, 12, 12, 0).toISOString()

const STAMP = '2026-11-01T09:00:00+00:00'

export function makeProject(p: Partial<Project> & Pick<Project, 'id' | 'name'>): Project {
  return {
    colour: 'sage',
    position: 0,
    status: 'active',
    created_at: STAMP,
    closed_at: null,
    ...p,
  }
}

export function makeTask(t: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: null,
    project_id: 'p1',
    task_type: 'general',
    status: 'not_started',
    status_before_done: null,
    due_date: null,
    planned_for: null,
    order: 0,
    today_order: null,
    created_at: STAMP,
    updated_at: STAMP,
    completed_at: null,
    ...t,
  }
}

// Listed out of position order on purpose: the Grid must sort by position.
export const PROJECTS: Project[] = [
  makeProject({ id: 'p2', name: 'Data Platform', colour: 'lavender', position: 1 }),
  makeProject({ id: 'p1', name: 'Twin Pilot', colour: 'sage', position: 0 }),
]

export const TASKS: Task[] = [
  makeTask({
    id: 't1',
    title: 'Finish pilot interim report',
    task_type: 'urgent',
    planned_for: TODAY,
  }),
  makeTask({
    id: 't2',
    title: 'Fix historian ingest gap',
    project_id: 'p2',
    task_type: 'urgent',
    status: 'blocked',
  }),
  makeTask({
    id: 't3',
    title: 'Chase Sam re: sensor access',
    task_type: 'quick',
    due_date: TODAY,
    order: 0,
  }),
  makeTask({
    id: 't4',
    title: 'Book site visit',
    task_type: 'quick',
    status: 'done',
    status_before_done: 'not_started',
    completed_at: YESTERDAY_ISO,
    order: 1,
  }),
]

/** A plain open task, for tests that need one task without the whole fixture. */
export const TASK: Task = makeTask({ id: 't-new', title: 'Chase Sam', task_type: 'quick' })

export function fixtureState(): AppState {
  return structuredClone({
    projects: PROJECTS,
    tasks: TASKS,
    notes: { p1: 'Sam: firewall change needs IT ticket' },
    problems: [],
    settings: {
      data_dir: '',
      port: 8765,
      text_size: 'medium' as const,
      collapsed_projects: [],
      collapsed_rows: [],
      show_completed: false,
      start_at_login: false,
    },
    windows_app: false,
  })
}

/** jsdom has no ResizeObserver: a stand-in that records what it watches and lets a test fire it. */
export class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  observed: Element[] = []
  disconnect = vi.fn()
  constructor(public callback: () => void) {
    FakeResizeObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
}

/** Put `app` back to the fixture, loaded, on TODAY. */
export function resetApp(): void {
  const s = fixtureState()
  app.projects = s.projects
  app.tasks = s.tasks
  app.notes = s.notes
  app.problems = s.problems
  app.settings = s.settings
  app.windows_app = s.windows_app
  app.today = TODAY
  app.loaded = true
  app.loadError = null
  FakeResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
}
