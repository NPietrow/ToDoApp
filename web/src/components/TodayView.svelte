<script lang="ts">
  // The Today view: today's date, the pinned open tasks in order, then Done today. One centred
  // column; the page scrolls, nothing inside it does. No progress bar, count or "+ add".
  import { tick } from 'svelte'
  import { dropIndex, TODAY_DRAG } from '../lib/dnd'
  import { taskMenuItems } from '../lib/menus'
  import { startPicking } from '../lib/picking'
  import { app } from '../lib/state.svelte'
  import { applyOrder, doneToday, longDate, moveInList, todayTasks } from '../lib/today'
  import { ui } from '../lib/ui.svelte'
  import ContextMenu from './ContextMenu.svelte'
  import TodayRow from './TodayRow.svelte'

  const saved = $derived(todayTasks(app.tasks, app.today))
  // The order just asked for, shown at once until the refresh brings the saved one (as TaskItem's
  // `pending` does). Tasks that came or went meanwhile still follow the saved list.
  let pending: string[] | null = $state(null)
  let seq = 0
  const open = $derived.by(() => {
    if (!pending) return saved
    const byId = new Map(saved.map((t) => [t.id, t]))
    const first = pending.filter((id) => byId.has(id))
    const rest = saved.filter((t) => !first.includes(t.id)).map((t) => t.id)
    return [...first, ...rest].map((id) => byId.get(id)!)
  })
  let listEl: HTMLElement | undefined = $state()

  async function reorder(ids: string[]) {
    const mine = ++seq
    pending = ids
    await applyOrder(ids, app.today)
    if (mine === seq) pending = null
  }

  async function move(id: string, delta: -1 | 1) {
    const ids = open.map((t) => t.id)
    const next = moveInList(ids, id, delta)
    if (next === ids) return
    void reorder(next)
    // Moving a focused element can drop its focus, so put it back once the list is redrawn.
    await tick()
    listEl?.querySelector<HTMLElement>(`[data-task-id="${id}"]`)?.focus()
  }

  const hasRow = (e: DragEvent) => !!e.dataTransfer?.types.includes(TODAY_DRAG)
  function onDragOver(e: DragEvent) {
    if (!hasRow(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }
  function onDrop(e: DragEvent) {
    const id = e.dataTransfer?.getData(TODAY_DRAG)
    if (!id || !listEl) return
    const current = open.map((t) => t.id)
    if (!current.includes(id)) return
    e.preventDefault()
    const rest = current.filter((x) => x !== id)
    const cards = [...listEl.querySelectorAll<HTMLElement>('[data-task-id]')]
      .filter((c) => c.dataset.taskId !== id)
      .map((c) => {
        const r = c.getBoundingClientRect()
        return { id: c.dataset.taskId!, mid: (r.top + r.bottom) / 2 }
      })
    const at = dropIndex(cards, rest, e.clientY)
    const next = [...rest.slice(0, at), id, ...rest.slice(at)]
    if (next.every((x, i) => x === current[i])) return
    void reorder(next)
  }
  const done = $derived(doneToday(app.tasks, app.today))

  // The Grid shows the menu on its own view; here only task menus can be opened.
  const menu = $derived.by(() => {
    const cm = ui.contextMenu
    if (!cm || cm.kind !== 'task') return null
    const task = app.tasks.find((t) => t.id === cm.id)
    if (!task) return null
    return taskMenuItems(task, {
      projects: app.projects.filter((p) => p.status === 'active').sort((a, b) => a.position - b.position),
      tasks: app.tasks,
      today: app.today,
      openTask: (id) => (ui.openTaskId = id),
    })
  })
</script>

<main class="today">
  <h1>{longDate(app.today)}</h1>

  {#if open.length === 0 && done.length === 0}
    <div class="empty">
      <p>Nothing picked for today</p>
      <button type="button" class="btn" onclick={startPicking}>Plan today</button>
    </div>
  {:else}
    {#if open.length > 0}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions (a drop target, not a control) -->
      <ul class="list" aria-label="Today" bind:this={listEl} ondragover={onDragOver} ondrop={onDrop}>
        {#each open as task (task.id)}
          <li><TodayRow {task} onmove={(delta) => void move(task.id, delta)} /></li>
        {/each}
      </ul>
    {/if}
    {#if done.length > 0}
      <section aria-labelledby="done-today">
        <h2 id="done-today">Done today</h2>
        <ul class="list">
          {#each done as task (task.id)}
            <li><TodayRow {task} /></li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</main>

{#if ui.contextMenu && menu}
  {#key ui.contextMenu}
    <ContextMenu items={menu} x={ui.contextMenu.x} y={ui.contextMenu.y}
      onclose={() => (ui.contextMenu = null)} />
  {/key}
{/if}

<style>
  .today {
    box-sizing: border-box;
    max-width: 720px;
    margin: 0 auto;
    padding: 4px 16px 32px;
  }
  h1 {
    margin: 4px 0 12px;
    font-size: 1.36em;
    font-weight: 600;
  }
  h2 {
    margin: 16px 0 6px;
    color: #a3a3a3;
    font-size: 0.84em;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 48px 16px;
  }
  .empty p {
    margin: 0 0 8px;
    font-size: 1.12em;
    font-weight: 600;
  }
</style>
