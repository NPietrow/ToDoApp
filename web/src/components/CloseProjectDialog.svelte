<script lang="ts">
  // Asked when closing a project that still has open tasks: move them to another active
  // project first, or close anyway (they stay on the closed project, never marked done).
  import { closeProject } from '../lib/api'
  import { dialogFocus } from '../lib/dialog'
  import { app, refresh } from '../lib/state.svelte'

  let { projectId, onClose }: { projectId: string; onClose: () => void } = $props()

  const project = $derived(app.projects.find((p) => p.id === projectId))
  const openCount = $derived(
    app.tasks.filter((t) => t.project_id === projectId && t.status !== 'done').length,
  )
  const targets = $derived(
    app.projects
      .filter((p) => p.status === 'active' && p.id !== projectId)
      .sort((a, b) => a.position - b.position),
  )

  const returnFocus = () =>
    document.querySelector<HTMLElement>(`[data-project-id="${CSS.escape(projectId)}"]`)

  let chosen = $state<string | null>(null)
  const target = $derived(chosen ?? targets[0]?.id ?? null)
  let error = $state<string | null>(null)
  let busy = $state(false)

  async function run(moveTo: string | null) {
    if (busy) return
    busy = true
    error = null
    try {
      await closeProject(projectId, moveTo)
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      busy = false
      return
    }
    onClose()
    void refresh()
  }
</script>

<div class="backdrop">
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="close-project-title"
    use:dialogFocus={{ onEscape: onClose, returnFocus }}
  >
    <h2 id="close-project-title">Close project</h2>
    <p>{project?.name ?? 'This project'} has {openCount} open {openCount === 1 ? 'task' : 'tasks'}.</p>
    {#if targets.length > 0}
      <label for="close-move-to">Move open tasks to…</label>
      <select id="close-move-to" value={target} onchange={(e) => (chosen = e.currentTarget.value)}>
        {#each targets as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button type="button" class="btn" onclick={onClose}>Cancel</button>
      <button type="button" class="btn" disabled={busy} onclick={() => run(null)}>Close anyway</button>
      {#if targets.length > 0}
        <button
          type="button"
          class="btn primary"
          data-autofocus
          disabled={busy}
          onclick={() => run(target)}>Move and close</button
        >
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(47, 52, 55, 0.25);
  }
  .dialog {
    width: min(400px, calc(100vw - 32px));
    padding: 16px 18px;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  }
  h2 {
    margin: 0 0 12px;
    font-size: 1.12em;
  }
  p {
    margin: 0 0 12px;
    overflow-wrap: anywhere;
  }
  label {
    display: block;
    margin-bottom: 4px;
    font-weight: 600;
  }
  select {
    box-sizing: border-box;
    width: 100%;
    font: inherit;
    padding: 6px 8px;
    border: 1px solid #d8d4cc;
    border-radius: 6px;
  }
  .error {
    margin: 8px 0 0;
    color: var(--blocked-fg);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }
</style>
