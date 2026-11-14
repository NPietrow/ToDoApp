<script lang="ts">
  // Paste text from anywhere (an AI reply, an email, a list); the server's lenient intake reads
  // it. A debounced preview shows what would be created, then Import creates it.
  import { onDestroy } from 'svelte'
  import { importIntake, previewIntake } from '../lib/api'
  import { plainPaste } from '../lib/paste'
  import { refresh } from '../lib/state.svelte'
  import { showToast } from '../lib/toast.svelte'
  import { TASK_TYPES, type PreviewResult } from '../lib/types'
  import { ui } from '../lib/ui.svelte'
  import Modal from './Modal.svelte'

  const DEBOUNCE_MS = 300
  const TYPE_LABELS: Record<string, string> = Object.fromEntries(TASK_TYPES.map((t) => [t.key, t.label]))

  let text = $state('')
  let preview = $state<PreviewResult | null>(null)
  let previewedText = $state('') // the text `preview` was made from
  let previewError = $state<string | null>(null)
  let busy = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0

  const items = $derived(preview?.items ?? [])
  const ready = $derived(items.length > 0 && previewedText === text && !busy)
  const summary = $derived.by(() => {
    const counts = new Map<string, number>()
    for (const it of items) {
      const name = it.project_name ?? 'Unsorted'
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    const parts = [...counts].map(([name, n]) => `${name} ×${n}`).join(', ')
    return `${items.length} ${items.length === 1 ? 'task' : 'tasks'} → ${parts}`
  })

  function onInput() {
    clearTimeout(timer)
    timer = setTimeout(() => void runPreview(text), DEBOUNCE_MS)
  }

  async function runPreview(forText: string) {
    const mine = ++seq
    if (forText.trim() === '') {
      preview = null
      previewError = null
      previewedText = forText
      return
    }
    try {
      const result = await previewIntake(forText)
      if (mine !== seq) return // a newer preview is on its way, or already here
      preview = result
      previewError = null
    } catch (err) {
      if (mine !== seq) return
      preview = null
      previewError = err instanceof Error ? err.message : String(err)
    }
    previewedText = forText
  }

  onDestroy(() => {
    clearTimeout(timer)
    seq++
  })

  async function doImport() {
    if (!ready) return
    busy = true
    try {
      const result = await importIntake(text)
      const skipped = result.errors.length ? ` (${result.errors.length} skipped)` : ''
      showToast({ message: `Imported ${result.imported.length} tasks${skipped}` })
      ui.modal = null
      void refresh()
    } catch (err) {
      previewError = err instanceof Error ? err.message : String(err)
      busy = false
    }
  }
</script>

<Modal name="paste" title="Paste tasks">
  <textarea aria-label="Paste tasks" rows="7" data-autofocus bind:value={text} oninput={onInput}
    use:plainPaste={{ multiline: true }} placeholder="Paste a list, an email or an AI reply…"
  ></textarea>

  {#if preview && items.length > 0}
    <p class="summary">{summary}</p>
    <ul class="items">
      {#each items as it, i (i)}
        <li>
          <span class="t">{it.title}</span>
          <span class="meta">{it.project_name ?? 'Unsorted'} · {TYPE_LABELS[it.task_type] ?? it.task_type}{it.due_date ? ` · due ${it.due_date}` : ''}</span>
        </li>
      {/each}
    </ul>
  {/if}
  {#if preview && preview.errors.length > 0}
    <ul class="errors">
      {#each preview.errors as e, i (i)}<li>{e}</li>{/each}
    </ul>
  {/if}
  {#if previewError}<p class="errors" role="alert">{previewError}</p>{/if}

  <div class="actions">
    <button type="button" class="btn" onclick={() => (ui.modal = null)}>Cancel</button>
    <button type="button" class="btn primary" disabled={!ready} onclick={doImport}>Import</button>
  </div>
</Modal>

<style>
  textarea {
    box-sizing: border-box;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #d8d4cc;
    border-radius: 6px;
    font: inherit;
    resize: vertical;
  }
  .summary {
    margin: 10px 0 4px;
    font-weight: 600;
  }
  ul {
    margin: 4px 0;
    padding: 0;
    list-style: none;
  }
  .items li {
    padding: 3px 0;
    border-bottom: 1px solid #f0ede8;
    overflow-wrap: anywhere;
  }
  .meta {
    margin-left: 8px;
    color: #8a8a8a;
    font-size: 0.9em;
  }
  .errors {
    color: var(--blocked-fg);
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
</style>
