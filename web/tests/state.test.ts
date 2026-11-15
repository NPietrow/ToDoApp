import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import * as api from '../src/lib/api'
import { ApiError } from '../src/lib/api'
import { app, connectEvents, refresh, startDayWatch } from '../src/lib/state.svelte'
import { clearToast, showToast, toast } from '../src/lib/toast.svelte'
import type { AppState } from '../src/lib/types'

const EMPTY_STATE: AppState = {
  projects: [],
  tasks: [],
  notes: {},
  problems: [],
  settings: {
    data_dir: '',
    port: 8765,
    text_size: 'medium',
    collapsed_projects: [],
    collapsed_rows: [],
    show_completed: false,
    start_at_login: false,
  },
  windows_app: false,
}

beforeEach(() => {
  app.loaded = false
  app.loadError = null
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  clearToast()
})

test('day rolls over on visibility', async () => {
  let now = new Date(2026, 10, 13, 23, 0)
  vi.spyOn(api, 'getState').mockResolvedValue(EMPTY_STATE)
  const stop = startDayWatch(() => now)
  expect(app.today).toBe('2026-11-13')
  now = new Date(2026, 10, 14, 7, 30)
  document.dispatchEvent(new Event('visibilitychange'))
  await Promise.resolve()
  expect(app.today).toBe('2026-11-14')
  expect(api.getState).toHaveBeenCalled()
  stop()
})

test('midnight timeout rolls the day over and re-arms', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 13, 23, 59, 30))
  const spy = vi.spyOn(api, 'getState').mockResolvedValue(EMPTY_STATE)
  const stop = startDayWatch(() => new Date(Date.now()))
  expect(app.today).toBe('2026-11-13')
  await vi.advanceTimersByTimeAsync(31_000)
  expect(app.today).toBe('2026-11-14')
  expect(spy).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(24 * 3600 * 1000)
  expect(app.today).toBe('2026-11-15')
  expect(spy).toHaveBeenCalledTimes(2)
  stop()
})

test('cleanup stops the timer and removes both listeners', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 13, 23, 59, 30))
  const spy = vi.spyOn(api, 'getState').mockResolvedValue(EMPTY_STATE)
  const stop = startDayWatch(() => new Date(Date.now()))
  stop()
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('focus'))
  await vi.advanceTimersByTimeAsync(2 * 24 * 3600 * 1000)
  expect(spy).not.toHaveBeenCalled()
})

test('focus triggers a rollover check too', async () => {
  let now = new Date(2026, 10, 13, 10, 0)
  const spy = vi.spyOn(api, 'getState').mockResolvedValue(EMPTY_STATE)
  const stop = startDayWatch(() => now)
  now = new Date(2026, 10, 14, 10, 0)
  window.dispatchEvent(new Event('focus'))
  await Promise.resolve()
  expect(app.today).toBe('2026-11-14')
  expect(spy).toHaveBeenCalledTimes(1)
  stop()
})

test('refresh copies state into app and marks loaded', async () => {
  vi.spyOn(api, 'getState').mockResolvedValue({ ...EMPTY_STATE, notes: { p: 'hi' } })
  await refresh()
  expect(app.loaded).toBe(true)
  expect(app.notes).toEqual({ p: 'hi' })
})

test('refresh coalesces overlapping calls into one follow-up', async () => {
  const resolvers: Array<(s: AppState) => void> = []
  const spy = vi
    .spyOn(api, 'getState')
    .mockImplementation(() => new Promise<AppState>((res) => resolvers.push(res)))
  const a = refresh()
  const b = refresh()
  const c = refresh()
  expect(spy).toHaveBeenCalledTimes(1)
  resolvers[0](EMPTY_STATE)
  await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
  resolvers[1](EMPTY_STATE)
  await Promise.all([a, b, c])
  expect(spy).toHaveBeenCalledTimes(2)
})

test('refresh survives a network error and an ApiError, keeping previous state', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  app.loaded = false
  const spy = vi.spyOn(api, 'getState').mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await expect(refresh()).resolves.toBeUndefined()
  expect(app.loaded).toBe(false)
  expect(app.loadError).toBe('Failed to fetch')
  spy.mockRejectedValueOnce(new ApiError(500, 'boom'))
  await expect(refresh()).resolves.toBeUndefined()
  expect(warn).toHaveBeenCalledTimes(2)
  expect(app.loadError).toBe('boom')
  spy.mockResolvedValueOnce({ ...EMPTY_STATE, notes: { k: 'v' } })
  await refresh()
  expect(app.loadError).toBeNull()
  spy.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await refresh()
  expect(app.loaded).toBe(true)
  expect(app.loadError).toBeNull() // a later failure keeps the board, with no error page
  expect(app.notes).toEqual({ k: 'v' })
})

class FakeES {
  listeners: Record<string, Array<() => void>> = {}
  closed = false
  url: string
  constructor(url: string) {
    this.url = url
  }
  addEventListener(type: string, fn: () => void) {
    ;(this.listeners[type] ??= []).push(fn)
  }
  fire(type: string) {
    this.listeners[type]?.forEach((f) => f())
  }
  close() {
    this.closed = true
  }
}

test('changed event refreshes; only an open after an error refreshes', async () => {
  const spy = vi.spyOn(api, 'getState').mockResolvedValue(EMPTY_STATE)
  let es!: FakeES
  const stop = connectEvents((url) => (es = new FakeES(url)) as unknown as EventSource)
  expect(es.url).toBe(api.eventsUrl)
  es.fire('open') // first open, no prior error: no refresh
  await Promise.resolve()
  expect(spy).not.toHaveBeenCalled()
  es.fire('changed')
  await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
  es.fire('error')
  es.fire('open')
  await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
  es.fire('open') // no new error: no refresh
  await Promise.resolve()
  expect(spy).toHaveBeenCalledTimes(2)
  stop()
  expect(es.closed).toBe(true)
})

test('reconnect after error triggers refresh', async () => {
  const spy = vi.spyOn(api, 'getState').mockResolvedValue(EMPTY_STATE)
  let es!: FakeES
  const stop = connectEvents((url) => (es = new FakeES(url)) as unknown as EventSource)
  es.fire('error')
  es.fire('open')
  await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
  stop()
})

test('toast shows one at a time and clears itself after the delay', () => {
  vi.useFakeTimers()
  showToast({ message: 'one' })
  expect(toast.current?.message).toBe('one')
  vi.advanceTimersByTime(3000)
  showToast({ message: 'two' })
  vi.advanceTimersByTime(3000)
  expect(toast.current?.message).toBe('two')
  vi.advanceTimersByTime(2001)
  expect(toast.current).toBeNull()
})

describe('server stopped (tray Quit with the window left open)', () => {
  beforeEach(() => {
    app.serverStopped = false
  })

  test('an error with the health check failing marks the server stopped; reconnecting clears it', async () => {
    vi.spyOn(api, 'getState').mockResolvedValue(EMPTY_STATE)
    let es!: FakeES
    const stop = connectEvents(
      (url) => (es = new FakeES(url)) as unknown as EventSource,
      async () => false,
    )
    es.fire('open')
    es.fire('error')
    await vi.waitFor(() => expect(app.serverStopped).toBe(true))
    es.fire('open') // the server is back on the same port
    expect(app.serverStopped).toBe(false)
    stop()
  })

  test('an error while the server still answers is only a blip', async () => {
    let es!: FakeES
    let probed = 0
    const stop = connectEvents(
      (url) => (es = new FakeES(url)) as unknown as EventSource,
      async () => (probed++, true),
    )
    es.fire('error')
    await vi.waitFor(() => expect(probed).toBe(1))
    await Promise.resolve()
    expect(app.serverStopped).toBe(false)
    stop()
  })

  test('a stale failed check after reconnecting, or after cleanup, changes nothing', async () => {
    vi.spyOn(api, 'getState').mockResolvedValue(EMPTY_STATE)
    let es!: FakeES
    const pending: Array<(up: boolean) => void> = []
    const stop = connectEvents(
      (url) => (es = new FakeES(url)) as unknown as EventSource,
      () => new Promise<boolean>((resolve) => pending.push(resolve)),
    )
    es.fire('error')
    es.fire('open') // reconnected before the check came back
    pending[0](false)
    await Promise.resolve()
    await Promise.resolve()
    expect(app.serverStopped).toBe(false)
    es.fire('error')
    stop()
    pending[1](false)
    await Promise.resolve()
    await Promise.resolve()
    expect(app.serverStopped).toBe(false)
  })
})
