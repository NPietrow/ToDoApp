<script lang="ts">
  // Paste an AI reply that contains the tasks as JSON (chat around it is fine); the server's
  // intake pulls the JSON out. A debounced preview shows what would be created, then Import
  // creates it. "Copy AI prompt" gives the user a prompt that makes an AI reply that way.
  import { onDestroy } from 'svelte'
  import { buildAiPrompt, buildExample } from '../lib/aiPrompt'
  import { importIntake, previewIntake } from '../lib/api'
  import { plainPaste } from '../lib/paste'
  import { app, refresh } from '../lib/state.svelte'
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

  const activeProjects = $derived(
    app.projects.filter((p) => p.status === 'active').sort((a, b) => a.position - b.position),
  )
  const example = $derived(buildExample(activeProjects[0]?.name, app.today))
  let copied = $state(false)
  let promptToCopy = $state<string | null>(null) // shown for copying by hand if the clipboard refuses
  const noTasks = $derived(previewError !== null && /no tasks found/i.test(previewError))
  const errorText = $derived(
    noTasks
      ? 'No JSON tasks found. Ask your AI for JSON (Copy AI prompt), or see the example below.'
      : previewError,
  )

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
    copied = false
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

  function useExample() {
    text = example
    copied = false
    clearTimeout(timer)
    void runPreview(text)
  }

  async function copyPrompt() {
    const prompt = buildAiPrompt(activeProjects.map((p) => p.name))
    try {
      await navigator.clipboard.writeText(prompt)
      copied = true
      promptToCopy = null
    } catch {
      copied = false
      promptToCopy = prompt
    }
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
    use:plainPaste={{ multiline: true }} placeholder="Paste an AI reply that contains the tasks as JSON. Chat around it is fine."
  ></textarea>

  {#if text === '' || noTasks}
    <div class="example">
      <div class="example-head">
        <span class="example-title">Example</span>
        <button type="button" class="link" onclick={useExample}>Use this example</button>
      </div>
      <pre>{example}</pre>
    </div>
  {/if}

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
  {#if errorText}<p class="errors" role="alert">{errorText}</p>{/if}

  {#if promptToCopy}
    <p class="hint">Couldn't use the clipboard. Select this prompt and copy it by hand.</p>
    <textarea aria-label="AI prompt" rows="6" readonly value={promptToCopy}
      onfocus={(e) => e.currentTarget.select()}></textarea>
  {/if}

  <div class="actions">
    <button type="button" class="btn copy" onclick={() => void copyPrompt()}
      >{copied ? 'Copied' : 'Copy AI prompt'}</button>
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
  .example {
    margin-top: 10px;
    color: #8a8a8a;
    font-size: 0.9em;
  }
  .example-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .example-title {
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .example pre {
    margin: 4px 0 0;
    font-family: ui-monospace, Consolas, monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  .link:hover {
    color: var(--text);
  }
  .hint {
    margin: 10px 0 4px;
    color: #8a8a8a;
    font-size: 0.9em;
  }
  .copy {
    margin-right: auto;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
</style>
