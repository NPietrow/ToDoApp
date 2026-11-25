<script lang="ts">
  // One row of the Today list: grip, tick box, title, due chip, task type, project chip and ×.
  // Alt+Up/Down on the focused row moves it; so does dragging it.
  // A click anywhere else on the row opens the pop-up; right-click, Shift+F10 and the ContextMenu
  // key open the task menu; Enter opens the task. × only unpins. Done rows have no grip or ×.
  import DueChip from './DueChip.svelte'
  import { TODAY_DRAG } from '../lib/dnd'
  import { colourOf } from '../lib/palette'
  import { app } from '../lib/state.svelte'
  import { setPinned } from '../lib/today'
  import { tickBox } from '../lib/tick.svelte'
  import { TASK_TYPES, type Task } from '../lib/types'
  import { ui } from '../lib/ui.svelte'

  let { task, onmove }: { task: Task; onmove?: (delta: -1 | 1) => void } = $props()

  const tick = tickBox(() => task)
  const done = $derived(tick.done)

  // A closed project still names the chip; a missing one (none, or unknown) reads Unsorted.
  const project = $derived(app.projects.find((p) => p.id === task.project_id) ?? null)
  const colours = $derived(project ? colourOf(project.colour) : null)
  const typeLabel = $derived(TASK_TYPES.find((t) => t.key === task.task_type)?.label ?? '')

  // A drag that ends over its own row must not also count as a click.
  let dragged = false

  function onclick(e: MouseEvent) {
    if (dragged || (e.target as HTMLElement).closest('a, .bx, .grip, .x')) return
    ui.openTaskId = task.id
  }

  function openMenu(x: number, y: number) {
    ui.contextMenu = { x, y, kind: 'task', id: task.id }
  }

  // Only the row itself drags; the tick box and the x never start one.
  function dragStart(e: DragEvent) {
    if ((e.target as HTMLElement).closest('.bx, .x')) {
      e.preventDefault()
      return
    }
    dragged = true
    e.dataTransfer?.setData(TODAY_DRAG, task.id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && onmove) {
      e.preventDefault()
      onmove(e.key === 'ArrowUp' ? -1 : 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      ui.openTaskId = task.id
    } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      openMenu(r.left + 16, r.top + r.height / 2)
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (the row is the keyboard target for Enter and the menu) -->
<div class="row" class:done={task.status === 'done'} data-task-id={task.id} role="group"
  tabindex="0" style:--accent={colours?.accent} {onclick} {onkeydown}
  draggable={task.status === 'done' ? undefined : 'true'} ondragstart={dragStart}
  ondragend={() => setTimeout(() => (dragged = false))} onpointerdown={() => (dragged = false)}
  oncontextmenu={(e) => {
    e.preventDefault()
    openMenu(e.clientX, e.clientY)
  }}
>
  <span class="c-grip">{#if task.status !== 'done'}<span class="grip" aria-hidden="true">⋮⋮</span>{/if}</span>
  <span class="c-tick">
    <button type="button" class="bx" class:on={done} role="checkbox" aria-checked={done}
      aria-label={task.title} draggable="false" onclick={tick.toggle}
    ></button>
  </span>
  <span class="c-title title">{task.title}</span>
  <span class="c-due">{#if task.due_date}<DueChip due={task.due_date} done={task.status === 'done'} />{/if}</span>
  <span class="c-type type">{typeLabel}</span>
  <span class="c-project"><span class="chip proj" style:background={colours?.header}>{project ? project.name : 'Unsorted'}</span></span>
  <span class="c-x">
    {#if task.status !== 'done'}
      <button type="button" class="x" aria-label="Remove from today" title="Remove from today"
        onclick={() => void setPinned(task, false, app.today)}>×</button
      >
    {/if}
  </span>
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 12px 15px minmax(0, 1fr) 78px 82px 128px 12px;
    align-items: center;
    column-gap: 10px;
    padding: 8px 10px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    line-height: 1.35;
    cursor: pointer;
  }
  .row:hover {
    box-shadow:
      0 0 0 1px var(--accent, #9a9a9a),
      0 2px 6px rgba(0, 0, 0, 0.1);
  }
  .row:focus-visible {
    outline: 2px solid var(--accent, #9a9a9a);
    outline-offset: 1px;
  }
  .c-due,
  .c-type,
  .c-project {
    justify-self: end;
    max-width: 100%;
    min-width: 0;
  }
  .c-x {
    display: flex;
    justify-content: flex-end;
  }
  .grip {
    display: block;
    color: #ccc;
    letter-spacing: -2px;
    cursor: grab;
  }
  .bx {
    display: block;
    box-sizing: border-box;
    width: 15px;
    height: 15px;
    padding: 0;
    border: 2px solid var(--accent, #9a9a9a);
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  .bx.on {
    background: var(--accent, #9a9a9a);
  }
  .title {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .done .title {
    color: #aaa;
    text-decoration: line-through;
  }
  .done {
    background: rgba(255, 255, 255, 0.55);
    box-shadow: none;
  }
  .chip {
    flex-shrink: 0;
    padding: 0 6px;
    border-radius: 8px;
    font-size: 0.84em;
    white-space: nowrap;
  }
  .proj {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 1px 8px;
    background: #ecebe7;
    color: #444;
  }
  .type {
    color: #a3a3a3;
    font-size: 0.84em;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  /* × only on hover or while the row (or something in it) has focus. Its space is kept, and it
     stays in the tab order (opacity, not visibility), so Tab from the row reaches it. */
  .x {
    padding: 0;
    border: 0;
    background: none;
    color: #9a9a9a;
    font: inherit;
    font-size: 1.15em;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
  }
  .row:hover .x,
  .row:focus-within .x {
    opacity: 1;
  }
  .x:hover {
    color: var(--text);
  }
  /* Narrow list: the title gets priority. The task type column goes (its cell stays in the DOM),
     the project column narrows and the due column gives up a little. */
  @container today (max-width: 559.98px) {
    .row {
      grid-template-columns: 12px 15px minmax(0, 1fr) 70px 92px 12px;
    }
    .c-type {
      display: none;
    }
  }
</style>
