<script lang="ts">
  // Text size and Start when I log in save at once. The data folder saves with "Use this
  // folder" (the server checks it and may refuse). Also: reopen closed projects, empty the trash.
  import { untrack } from 'svelte'
  import { emptyTrash, patchSettings, reopenProject } from '../lib/api'
  import { app, refresh } from '../lib/state.svelte'
  import { showToast } from '../lib/toast.svelte'
  import type { Settings, TextSize } from '../lib/types'
  import Modal from './Modal.svelte'

  const SIZES: { key: TextSize; label: string }[] = [
    { key: 'small', label: 'Small' },
    { key: 'medium', label: 'Medium' },
    { key: 'large', label: 'Large' },
  ]

  const msg = (err: unknown) => (err instanceof Error ? err.message : String(err))
  const closed = $derived(app.projects.filter((p) => p.status === 'closed'))
  // A closed project's open tasks are hidden ("close anyway"); say how many wait behind Reopen.
  const openCount = (projectId: string) =>
    app.tasks.filter((t) => t.project_id === projectId && t.status !== 'done').length

  let folder = $state(untrack(() => app.settings.data_dir))
  let folderDirty = false
  let folderError = $state<string | null>(null)
  let folderBusy = $state(false)

  $effect(() => {
    const incoming = app.settings.data_dir
    untrack(() => {
      if (!folderDirty) folder = incoming
    })
  })

  // A drive path (C:\…), a network share (\\server\…) or, in Docker, a POSIX path (/data).
  // The server checks again; a relative path would resolve against wherever it started.
  const FULL_PATH = /^([A-Za-z]:[\\/]|[\\/]{2}|\/)/
  const FULL_PATH_NEEDED = 'Use a full path, e.g. C:\\Users\\you\\Documents\\ToDoApp'

  async function useFolder() {
    if (!FULL_PATH.test(folder)) {
      folderError = FULL_PATH_NEEDED
      return
    }
    folderBusy = true
    folderError = null
    try {
      await patchSettings({ data_dir: folder })
      folderDirty = false
      void refresh()
    } catch (err) {
      folderError = msg(err)
    } finally {
      folderBusy = false
    }
  }

  async function setSetting<K extends 'text_size' | 'start_at_login'>(key: K, value: Settings[K]) {
    const before = app.settings[key]
    app.settings[key] = value
    try {
      await patchSettings({ [key]: value })
    } catch (err) {
      app.settings[key] = before
      showToast({ message: `Couldn't save setting: ${msg(err)}` })
    }
    void refresh()
  }

  async function reopen(id: string) {
    try {
      await reopenProject(id)
    } catch (err) {
      showToast({ message: `Couldn't reopen project: ${msg(err)}` })
    }
    void refresh()
  }

  let confirming = $state(false)
  let removed = $state<number | null>(null)
  let trashError = $state<string | null>(null)

  async function confirmEmpty() {
    confirming = false
    try {
      removed = (await emptyTrash()).removed
      trashError = null
    } catch (err) {
      trashError = msg(err)
    }
    void refresh()
  }
</script>

<Modal name="settings" title="Settings">
  <section>
    <label for="data-dir">Data folder</label>
    <div class="row">
      <input id="data-dir" type="text" autocomplete="off" bind:value={folder}
        oninput={() => (folderDirty = true)} />
      <button type="button" class="btn" disabled={folderBusy} onclick={useFolder}>Use this folder</button>
    </div>
    <p class="muted help">Nothing is moved; the board shows what's in the new folder.</p>
    {#if folderError}<p class="error" role="alert">{folderError}</p>{/if}
  </section>

  <section>
    <span class="label" id="lbl-size">Text size</span>
    <span class="seg" role="group" aria-labelledby="lbl-size">
      {#each SIZES as s (s.key)}
        <button type="button" class:on={app.settings.text_size === s.key}
          aria-pressed={app.settings.text_size === s.key}
          onclick={() => void setSetting('text_size', s.key)}>{s.label}</button>
      {/each}
    </span>
  </section>

  {#if app.windows_app}
    <section>
      <label class="check">
        <input type="checkbox" checked={app.settings.start_at_login}
          onchange={(e) => void setSetting('start_at_login', e.currentTarget.checked)} />
        Start when I log in
      </label>
    </section>
  {/if}

  <section>
    <span class="label">Closed projects</span>
    {#if closed.length === 0}
      <p class="muted">None.</p>
    {:else}
      <ul>
        {#each closed as p (p.id)}
          {@const open = openCount(p.id)}
          <li>
            <span class="name">{p.name}</span>
            <span class="end">
              {#if open > 0}<span class="muted">{open} open</span>{/if}
              <button type="button" class="btn" onclick={() => void reopen(p.id)}>Reopen</button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <span class="label">Trash</span>
    {#if confirming}
      <span class="row">
        <span>Delete trashed tasks permanently?</span>
        <button type="button" class="btn primary" onclick={() => void confirmEmpty()}>Confirm</button>
        <button type="button" class="btn" onclick={() => (confirming = false)}>Cancel</button>
      </span>
    {:else}
      <span class="row">
        <button type="button" class="btn" onclick={() => { confirming = true; removed = null }}>Empty trash</button>
        {#if removed !== null}<span>Removed {removed}</span>{/if}
      </span>
    {/if}
    {#if trashError}<p class="error" role="alert">{trashError}</p>{/if}
  </section>
</Modal>

<style>
  section {
    margin-bottom: 16px;
  }
  label:not(.check),
  .label {
    display: block;
    margin-bottom: 4px;
    color: #999;
    font-size: 0.88em;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  input[type='text'] {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: 5px 8px;
    border: 1px solid #d8d4cc;
    border-radius: 6px;
    font: inherit;
  }
  .error {
    margin: 6px 0 0;
    color: var(--blocked-fg);
    overflow-wrap: anywhere;
  }
  .muted.help {
    margin-top: 4px;
  }
  .muted {
    margin: 0;
    color: #7d7d7d;
  }
  .seg button {
    margin-right: -1px;
    padding: 1px 12px;
    border: 1px solid #e3e0d9;
    background: #fbfaf8;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .seg button:first-child {
    border-radius: 10px 0 0 10px;
  }
  .seg button:last-child {
    border-radius: 0 10px 10px 0;
  }
  .seg button.on {
    background: #ebe8e2;
    font-weight: 600;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
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
    padding: 4px 0;
  }
  .name {
    overflow-wrap: anywhere;
  }
  .end {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 10px;
  }
</style>
