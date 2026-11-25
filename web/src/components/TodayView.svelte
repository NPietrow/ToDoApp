<script lang="ts">
  // The Today view: today's date, the pinned open tasks in order, then Done today. One centred
  // column; the page scrolls, nothing inside it does. No progress bar, count or "+ add".
  import { taskMenuItems } from '../lib/menus'
  import { startPicking } from '../lib/picking'
  import { app } from '../lib/state.svelte'
  import { doneToday, longDate, todayTasks } from '../lib/today'
  import { ui } from '../lib/ui.svelte'
  import ContextMenu from './ContextMenu.svelte'
  import TodayRow from './TodayRow.svelte'

  const open = $derived(todayTasks(app.tasks, app.today))
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
      <ul class="list" aria-label="Today">
        {#each open as task (task.id)}
          <li><TodayRow {task} /></li>
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
