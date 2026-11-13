<script lang="ts">
  // Small modal asking for a project name: a new project, or a rename.
  import { untrack } from 'svelte'
  import { createProject, patchProject } from '../lib/api'
  import { dialogFocus } from '../lib/dialog'
  import { refresh } from '../lib/state.svelte'

  let {
    mode = 'create',
    initialName = '',
    projectId,
    position,
    onClose,
  }: {
    mode?: 'create' | 'rename'
    initialName?: string
    /** The project being renamed (rename mode). */
    projectId?: string
    /** Where to insert the new project; omitted means at the end. */
    position?: number
    onClose: () => void
  } = $props()

  let name = $state(untrack(() => initialName))
  let error = $state<string | null>(null)
  let busy = $state(false)

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    busy = true
    error = null
    try {
      if (mode === 'rename' && projectId) {
        if (trimmed !== initialName) await patchProject(projectId, { name: trimmed })
      } else {
        await createProject(trimmed, position)
      }
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
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="project-name-title"
    use:dialogFocus={{ onEscape: onClose }}
  >
    <form onsubmit={submit}>
      <h2 id="project-name-title">{mode === 'rename' ? 'Rename project' : 'New project'}</h2>
      <label for="project-name">Project name</label>
      <input
        id="project-name"
        type="text"
        bind:value={name}
        data-autofocus
        autocomplete="off"
      />
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button type="button" class="btn" onclick={onClose}>Cancel</button>
        <button type="submit" class="btn primary" disabled={busy}>{mode === 'rename' ? 'Rename' : 'Create'}</button>
      </div>
    </form>
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
    width: min(360px, calc(100vw - 32px));
    padding: 16px 18px;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  }
  h2 {
    margin: 0 0 12px;
    font-size: 1.12em;
  }
  label {
    display: block;
    margin-bottom: 4px;
    font-weight: 600;
  }
  input {
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
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }
</style>
