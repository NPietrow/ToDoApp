import { describe, expect, test } from 'vitest'
import { serial } from '../src/lib/serial'

function deferred<T = void>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('serial', () => {
  test('runs in call order even when earlier work is slower', async () => {
    const run = serial()
    const order: string[] = []
    const first = deferred()
    const second = deferred()

    const p1 = run(async () => {
      order.push('start1')
      await first.promise
      order.push('end1')
    })
    const p2 = run(async () => {
      order.push('start2')
      await second.promise
      order.push('end2')
    })

    second.resolve()
    await Promise.resolve()
    first.resolve()
    await Promise.all([p1, p2])
    expect(order).toEqual(['start1', 'end1', 'start2', 'end2'])
  })

  test('a failure does not block the next call', async () => {
    const run = serial()
    const failing = run(() => Promise.reject(new Error('boom')))
    const next = run(() => Promise.resolve('ok'))
    await expect(failing).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
  })

  test('returns each call its own value', async () => {
    const run = serial()
    const [a, b] = await Promise.all([run(async () => 1), run(async () => 'two')])
    expect(a).toBe(1)
    expect(b).toBe('two')
  })
})
