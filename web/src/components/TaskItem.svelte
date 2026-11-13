<script lang="ts">
  // One task card in a Grid cell. The tick box and title only display here: Task 12 wires
  // ticking, Task 16 opens the pop-up on click. The project's accent comes from the
  // enclosing cell's --accent custom property.
  import { formatDue, isToday } from '../lib/dates'
  import { app } from '../lib/state.svelte'
  import type { Task } from '../lib/types'

  let { task }: { task: Task } = $props()

  const done = $derived(task.status === 'done')
</script>

<div class="t" class:pin={isToday(task, app.today)} class:done data-task-id={task.id}>
  <button type="button" class="bx" role="checkbox" aria-checked={done} aria-label={task.title}
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
