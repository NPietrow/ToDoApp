<script lang="ts">
  // One task card in a Grid cell. The tick box ticks; a click anywhere else on the card opens
  // the pop-up (a link inside it is followed instead). Right-click, Shift+F10 and the ContextMenu key open its menu
  // (shown by the Grid); Enter opens the task and Delete deletes it. The project's accent comes from the enclosing cell's
  // --accent custom property.
  import { setDone } from '../lib/api'
  import { formatDue, isToday } from '../lib/dates'
  import { deleteWithUndo } from '../lib/menus'
  import { app, refresh } from '../lib/state.svelte'
  import { showToast } from '../lib/toast.svelte'
  import type { Task } from '../lib/types'
  import { ui } from '../lib/ui.svelte'

  let { task }: { task: Task } = $props()

  // Ticking shows at once: `pending` holds the tick until the task itself changes (the
  // refresh arrives) or the server refuses it.
  let pending: boolean | null = $state(null)
  const done = $derived(pending ?? task.status === 'done')

  $effect(() => {
    void task.status
    void task.updated_at
    pending = null
  })

  // A drag that ends over its own card must not also count as a click.
  let dragged = false

  function onclick(e: MouseEvent) {
    if (dragged || (e.target as HTMLElement).closest('a, .bx')) return
    ui.openTaskId = task.id
  }

  function dragStart(e: DragEvent) {
    // Only the card itself drags; the tick box (and anything inside the card) never starts one.
    if ((e.target as HTMLElement).closest('.bx')) {
      e.preventDefault()
      return
    }
    dragged = true
    e.dataTransfer?.setData('text/x-task-id', task.id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  function openMenu(x: number, y: number) {
    ui.contextMenu = { x, y, kind: 'task', id: task.id }
  }

  function onkeydown(e: KeyboardEvent) {
    // Only keys pressed on the card itself, never on the tick box.
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter') {
      e.preventDefault()
      ui.openTaskId = task.id
    } else if (e.key === 'Delete') {
      e.preventDefault()
      void deleteWithUndo(task)
    } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      openMenu(r.left + 16, r.top + r.height / 2)
    }
  }

  async function toggle(e: MouseEvent) {
    e.stopPropagation()
    const next = !done
    pending = next
    try {
      await setDone(task.id, next)
    } catch (err) {
      pending = null
      const reason = err instanceof Error ? err.message : String(err)
      showToast({ message: `Couldn't update task: ${reason}` })
      return
    }
    void refresh()
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (the card is the keyboard target for Enter, Delete and the menu) -->
<div class="t" class:pin={isToday(task, app.today)} class:done data-task-id={task.id}
  draggable="true" ondragstart={dragStart} ondragend={() => setTimeout(() => (dragged = false))}
  {onclick} role="group" tabindex="0" {onkeydown}
  oncontextmenu={(e) => {
    e.preventDefault()
    openMenu(e.clientX, e.clientY)
  }}
>
  <button type="button" class="bx" role="checkbox" aria-checked={done} aria-label={task.title}
    draggable="false" onclick={toggle}
  ></button>
  <span class="body">
    <span class="title">{task.title}</span>
    {#if task.due_date}<span class="chip due">{formatDue(task.due_date, app.today)}</span>{/if}
    {#if task.status === 'blocked'}<span class="chip blk">Blocked</span>{/if}
    {#if task.description}<span class="desc" role="img" aria-label="has description">≡</span>{/if}
  </span>
</div>

<style>
  .t {
    display: flex;
    gap: 9px;
    align-items: flex-start;
    background: #fff;
    border-radius: 8px;
    padding: 7px 9px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    line-height: 1.35;
  }
  .body {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .pin {
    font-weight: 700;
  }
  .t:focus-visible {
    outline: 2px solid var(--accent, #9a9a9a);
    outline-offset: 1px;
  }
  .done {
    color: #aaa;
    text-decoration: line-through;
    background: rgba(255, 255, 255, 0.55);
    box-shadow: none;
  }
  .bx {
    flex-shrink: 0;
    box-sizing: border-box;
    width: 15px;
    height: 15px;
    margin: 1px 0 0;
    padding: 0;
    border: 2px solid var(--accent, #9a9a9a);
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  .done .bx {
    background: var(--accent, #9a9a9a);
  }
  .chip {
    margin-left: 4px;
    padding: 0 6px;
    border-radius: 8px;
    font-size: 0.84em;
    white-space: nowrap;
  }
  .due {
    color: var(--due-fg);
    background: var(--due-bg);
  }
  .blk {
    color: var(--blocked-fg);
    background: var(--blocked-bg);
    font-weight: 700;
  }
  .desc {
    margin-left: 4px;
    color: #8a8a8a;
    font-weight: 400;
  }
</style>
