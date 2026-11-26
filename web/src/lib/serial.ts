// A tiny promise queue: each call starts only after the previous one has settled, so writes
// reach the server in the order they were made. A rejection goes to its own caller and does
// not hold up the calls behind it.
export function serial(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const result = tail.then(fn)
    tail = result.catch(() => undefined)
    return result
  }
}
