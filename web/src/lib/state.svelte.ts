import { eventsUrl, getState, serverAnswers } from './api'
import { localToday } from './dates'
import type { AppState, Task } from './types'

export const app: AppState & {
  today: string
  loaded: boolean
  loadError: string | null
  serverStopped: boolean
} = $state({
  projects: [],
  tasks: [],
  notes: {},
  problems: [],
  settings: {
    data_dir: '',
    port: 0,
    text_size: 'medium',
    collapsed_projects: [],
    collapsed_rows: [],
    show_completed: false,
    start_at_login: false,
  },
  windows_app: false,
  today: localToday(),
  loaded: false,
  /** Why the first load failed; null once the board has loaded. */
  loadError: null,
  /** The server has gone (tray Quit with this window left open, or a crash). */
  serverStopped: false,
})

/**
 * Open tasks with no project, or with a project id nobody knows (deleted, or a hand edit).
 * Open tasks of a closed project are not Unsorted: they stay open but hidden (spec, "close anyway").
 */
export function unsortedTasks(): Task[] {
  const known = new Set(app.projects.map((p) => p.id))
  return app.tasks.filter((t) => t.status !== 'done' && (t.project_id === null || !known.has(t.project_id)))
}

let running: Promise<void> | null = null
let again = false

async function fetchOnce(): Promise<void> {
  try {
    const s = await getState()
    app.projects = s.projects
    app.tasks = s.tasks
    app.notes = s.notes
    app.problems = s.problems
    app.settings = s.settings
    app.windows_app = s.windows_app
    app.loaded = true
    app.loadError = null
  } catch (e) {
    // Keep the previous state; the next change event or reconnect will try again.
    console.warn('Could not refresh state', e)
    // Before the first load there is no board to keep: say why, so the page can offer a retry.
    if (!app.loaded) app.loadError = e instanceof Error ? e.message : String(e)
  }
}

/** Refetch /api/state. Overlapping calls coalesce: one more fetch runs after the current one. */
export function refresh(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await fetchOnce()
      } while (again)
    } finally {
      running = null
    }
  })()
  return running
}

/**
 * Subscribe to the server's change events. Returns a cleanup that closes the connection.
 * When the stream drops, `isUp` checks whether the server still answers: if not, the board is
 * replaced by a "ToDoApp isn't running" message until the stream reconnects (EventSource retries
 * on its own, so starting ToDoApp again on the same port brings the window back).
 */
export function connectEvents(
  make: (url: string) => EventSource = (url) => new EventSource(url),
  isUp: () => Promise<boolean> = serverAnswers,
): () => void {
  const es = make(eventsUrl)
  let hadError = false
  let connected = false
  let closed = false
  es.addEventListener('changed', () => void refresh())
  es.addEventListener('error', () => {
    hadError = true
    connected = false
    void isUp().then((up) => {
      if (!up && !connected && !closed) app.serverStopped = true
    })
  })
  es.addEventListener('open', () => {
    connected = true
    app.serverStopped = false
    if (hadError) {
      hadError = false
      void refresh() // changes may have been missed while disconnected
    }
  })
  return () => {
    closed = true
    es.close()
  }
}

/**
 * Keep app.today right while the window stays open: a timer at local midnight, plus a check
 * when the tab becomes visible or the window gains focus. Refreshes only when the date changed.
 */
export function startDayWatch(now: () => Date = () => new Date()): () => void {
  app.today = localToday(now())
  let timer: ReturnType<typeof setTimeout> | undefined

  const check = () => {
    const today = localToday(now())
    if (today !== app.today) {
      app.today = today
      void refresh()
    }
  }
  const arm = () => {
    const n = now()
    const midnight = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1)
    timer = setTimeout(() => {
      check()
      arm()
    }, midnight.getTime() - n.getTime() + 1000)
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') check()
  }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', check)
  arm()
  return () => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', check)
  }
}
