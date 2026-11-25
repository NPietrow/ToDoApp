// The tick box behaviour shared by task cards and Today rows. Ticking shows at once: `pending`
// holds the tick until the task itself changes (the refresh arrives) or the server refuses it.
// Call during component initialisation (it sets up an effect).
import { setDone } from './api'
import { refresh } from './state.svelte'
import { showToast } from './toast.svelte'
import type { Task } from './types'

export function tickBox(task: () => Task): { readonly done: boolean; toggle: (e: MouseEvent) => Promise<void> } {
  let pending: boolean | null = $state(null)
  const done = $derived(pending ?? task().status === 'done')

  $effect(() => {
    const t = task()
    void t.status
    void t.updated_at
    pending = null
  })

  async function toggle(e: MouseEvent) {
    e.stopPropagation()
    const id = task().id
    const next = !done
    pending = next
    try {
      await setDone(id, next)
    } catch (err) {
      pending = null
      const reason = err instanceof Error ? err.message : String(err)
      showToast({ message: `Couldn't update task: ${reason}` })
      return
    }
    void refresh()
  }

  return {
    get done() {
      return done
    },
    toggle,
  }
}
