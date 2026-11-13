import { afterEach, expect, test, vi } from 'vitest'
import {
  ApiError,
  closeProject,
  createProject,
  deleteTask,
  moveTask,
  patchTask,
  putNotes,
} from '../src/lib/api'

afterEach(() => vi.restoreAllMocks())

test('api throws ApiError with server detail', async () => {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ detail: "A project called 'X' already exists" }), { status: 409 }),
  )
  await expect(createProject('X')).rejects.toMatchObject({
    status: 409,
    message: "A project called 'X' already exists",
  })
  await expect(createProject('X')).rejects.toBeInstanceOf(ApiError)
})

test('api sends JSON with same-origin credentials', async () => {
  const f = vi.fn(async (_p: RequestInfo | URL, _i?: RequestInit) => new Response('{}', { status: 200 }))
  globalThis.fetch = f
  await patchTask('id1', { due_date: null })
  expect(f).toHaveBeenCalledWith(
    '/api/tasks/id1',
    expect.objectContaining({
      method: 'PATCH',
      body: '{"due_date":null}',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    }),
  )
})

test('204 resolves to undefined and bodyless calls send no body or content type', async () => {
  const f = vi.fn(async (_p: RequestInfo | URL, _i?: RequestInit) => new Response(null, { status: 204 }))
  globalThis.fetch = f
  await expect(deleteTask('id1')).resolves.toBeUndefined()
  const init = f.mock.calls[0][1]!
  expect(init.method).toBe('DELETE')
  expect(init.body).toBeUndefined()
  expect(init.headers).toBeUndefined()
  await expect(putNotes('p1', 'hi')).resolves.toBeUndefined()
})

test('422 validation array is joined into one message', async () => {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ detail: [{ msg: 'Field required', loc: ['body', 'x'] }, { msg: 'Bad value' }] }),
        { status: 422 },
      ),
  )
  await expect(createProject('X')).rejects.toMatchObject({
    status: 422,
    message: 'Field required; Bad value',
  })
})

test('non-JSON error falls back to the status text', async () => {
  globalThis.fetch = vi.fn(
    async () => new Response('boom', { status: 500, statusText: 'Internal Server Error' }),
  )
  await expect(createProject('X')).rejects.toMatchObject({
    status: 500,
    message: 'Internal Server Error',
  })
})

test('closeProject sends move_open_to, null when omitted', async () => {
  const f = vi.fn(async (_p: RequestInfo | URL, _i?: RequestInit) => new Response('{}', { status: 200 }))
  globalThis.fetch = f
  await closeProject('a', null)
  await closeProject('a', 'b')
  expect(f.mock.calls[0][1]).toMatchObject({ body: '{"move_open_to":null}' })
  expect(f.mock.calls[1][1]).toMatchObject({ body: '{"move_open_to":"b"}' })
  expect(f.mock.calls[0][0]).toBe('/api/projects/a/close')
})

test('moveTask accepts null project (Unsorted)', async () => {
  const f = vi.fn(async (_p: RequestInfo | URL, _i?: RequestInit) => new Response('[]', { status: 200 }))
  globalThis.fetch = f
  await moveTask('t', null, 'urgent', 2)
  expect(f.mock.calls[0][1]).toMatchObject({
    body: '{"project_id":null,"task_type":"urgent","index":2}',
  })
})
