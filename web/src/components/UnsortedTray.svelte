<script lang="ts">
  // Open tasks with no project or an unknown one, each with a project picker. A closed project's
  // open tasks aren't listed: they stay hidden until it is reopened (Settings shows the count).
  import { patchTask } from '../lib/api'
  import { app, refresh, unsortedTasks } from '../lib/state.svelte'
  import { showToast } from '../lib/toast.svelte'
  import Modal from './Modal.svelte'

  const tasks = $derived(unsortedTasks())
  const projects = $derived(
    app.projects.filter((p) => p.status === 'active').sort((a, b) => a.position - b.position),
  )

  async function assign(id: string, projectId: string) {
    if (!projectId) return
    try {
      await patchTask(id, { project_id: projectId })
    } catch (err) {
      showToast({ message: `Couldn't move task: ${err instanceof Error ? err.message : String(err)}` })
    }
    void refresh()
  }
</script>

<Modal name="unsorted" title="Unsorted">
  {#if tasks.length === 0}
    <p class="empty">Nothing is unsorted.</p>
  {:else}
    <ul>
      {#each tasks as t (t.id)}
        <li>
          <span class="t">{t.title}</span>
          <select aria-label={`Project for ${t.title}`} value="" onchange={(e) => void assign(t.id, e.currentTarget.value)}>
            <option value="">Choose a project…</option>
            {#each projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
          </select>
        </li>
      {/each}
    </ul>
  {/if}
</Modal>

<style>
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px solid #f0ede8;
  }
  .t {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  select {
    flex-shrink: 0;
    max-width: 50%;
    font: inherit;
    padding: 2px 8px;
    border: 1px solid #e3e0d9;
    border-radius: 12px;
    background: #fbfaf8;
  }
  .empty {
    margin: 0;
    color: #7d7d7d;
  }
</style>
