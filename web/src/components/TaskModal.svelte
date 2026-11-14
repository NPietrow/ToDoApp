<script lang="ts">
  // The task pop-up, centred over a dimmed board. Title and description save 400 ms after the
  // last keystroke; everything else saves at once. Closing (Esc, ✕, the backdrop) flushes a
  // pending save first. Opens when ui.openTaskId is set, and closes itself if the task goes away.
  import { onDestroy, untrack } from 'svelte'
  import { patchTask, setDone } from '../lib/api'
  import { dialogFocus } from '../lib/dialog'
  import { formatDue, formatShortDate, formatStamp, isToday } from '../lib/dates'
  import { deleteWithUndo } from '../lib/menus'
  import { colourOf } from '../lib/palette'
  import { plainPaste } from '../lib/paste'
  import { app, refresh } from '../lib/state.svelte'
  import { continueBullet, linkify } from '../lib/text'
  import { showToast } from '../lib/toast.svelte'
  import { STATUS_LABELS, TASK_TYPES, type Status, type TaskChanges } from '../lib/types'
  import { ui } from '../lib/ui.svelte'
  import DatePicker from './DatePicker.svelte'

  const DEBOUNCE_MS = 400
  const STATUSES = Object.keys(STATUS_LABELS) as Status[]

  const id = ui.openTaskId as string
  const task = $derived(app.tasks.find((t) => t.id === id))
  const projects = $derived(
    app.projects.filter((p) => p.status === 'active').sort((a, b) => a.position - b.position),
  )
  const project = $derived(app.projects.find((p) => p.id === task?.project_id))
  const accent = $derived(colourOf(project?.colour).accent)
  const done = $derived(task?.status === 'done')

  // What the user is typing. Incoming refreshes leave these alone while a field has focus
  // or a save is waiting.
  let titleDraft = $state(untrack(() => task?.title ?? ''))
  let descDraft = $state(untrack(() => task?.description ?? ''))
  let titleEl: HTMLInputElement | undefined = $state()
  let editing = $state(false)
  let pickerOpen = $state(false)
  let dueBtn: HTMLButtonElement | undefined = $state()

  let pending: TaskChanges = {}
  let timer: ReturnType<typeof setTimeout> | undefined

  $effect(() => {
    const title = task?.title
    const desc = task?.description ?? ''
    untrack(() => {
      if (title === undefined) return
      if (document.activeElement !== titleEl && pending.title === undefined) titleDraft = title
      if (!editing && pending.description === undefined) descDraft = desc
    })
  })

  // Deleted elsewhere (or by a live refresh): nothing left to edit.
  $effect(() => {
    if (app.loaded && !task) {
      cancelPending()
      ui.openTaskId = null
    }
  })

  function cancelPending() {
    clearTimeout(timer)
    timer = undefined
    pending = {}
  }

  /** Run an API call, then refresh; on failure toast the reason. Resolves to whether it worked. */
  async function attempt(fn: () => Promise<unknown>): Promise<boolean> {
    try {
      await fn()
    } catch (err) {
      showToast({ message: `Couldn't update task: ${err instanceof Error ? err.message : String(err)}` })
      void refresh()
      return false
    }
    void refresh()
    return true
  }

  const save = (changes: TaskChanges, keepalive = false) =>
    attempt(() => (keepalive ? patchTask(id, changes, { keepalive: true }) : patchTask(id, changes)))

  function queue(changes: TaskChanges) {
    pending = { ...pending, ...changes }
    clearTimeout(timer)
    timer = setTimeout(() => flush(), DEBOUNCE_MS)
  }

  /** `keepalive` lets the save outlive the page: used when the window is closing. */
  function flush(keepalive = false) {
    clearTimeout(timer)
    timer = undefined
    if (Object.keys(pending).length === 0) return
    const changes = pending
    pending = {}
    void save(changes, keepalive)
  }

  // onDestroy doesn't run when the window closes; pagehide does.
  onDestroy(() => flush())

  function close() {
    flush()
    ui.openTaskId = null
  }

  function onTitleInput() {
    const title = titleDraft.trim()
    if (title) queue({ title })
    else {
      const { title: _dropped, ...rest } = pending
      pending = rest
    }
  }

  function onDescInput() {
    queue({ description: descDraft.trim() === '' ? null : descDraft })
  }

  function onDescKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return
    const box = e.currentTarget as HTMLTextAreaElement
    if (box.selectionStart !== box.selectionEnd) return
    const next = continueBullet(box.value, box.selectionStart)
    if (!next) return
    e.preventDefault()
    descDraft = next.value
    box.value = next.value
    box.setSelectionRange(next.caret, next.caret)
    onDescInput()
  }

  /** The textarea: focus it with the caret at the end, and grow with its content (up to 50vh by CSS). */
  function editor(node: HTMLTextAreaElement) {
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }
  function grow(node: HTMLTextAreaElement, _text: string) {
    const fit = () => {
      node.style.height = 'auto'
      node.style.height = `${node.scrollHeight}px`
    }
    fit()
    return { update: fit }
  }

  function startEditing(e: MouseEvent | KeyboardEvent) {
    if ((e.target as HTMLElement).closest('a')) return
    editing = true
  }

  function endEditing() {
    editing = false
    if (pending.description === undefined) descDraft = task?.description ?? ''
  }

  function pickDate(day: string | null) {
    pickerOpen = false
    // The button that was clicked is about to leave the page: keep focus inside the dialog.
    dueBtn?.focus()
    void save({ due_date: day })
  }

  function onDueKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && pickerOpen) {
      e.preventDefault()
      e.stopPropagation()
      pickerOpen = false
    }
  }

  let downOnBackdrop = false

  function onToggleToday(e: Event) {
    const box = e.currentTarget as HTMLInputElement
    void save({ planned_for: box.checked ? app.today : null }).then((ok) => {
      if (!ok) box.checked = !box.checked
    })
  }

  function remove() {
    if (!task) return
    cancelPending()
    ui.openTaskId = null
    void deleteWithUndo(task)
  }

  const returnFocus = () => document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)
</script>

<svelte:window onpagehide={() => flush(true)} />

{#if task}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Esc closes; the backdrop click is a mouse shortcut) -->
  <div class="backdrop" data-testid="task-backdrop"
    onmousedown={(e) => (downOnBackdrop = e.target === e.currentTarget)}
    onclick={(e) => {
      if (downOnBackdrop && e.target === e.currentTarget) close()
    }}
  >
    <div class="modal" role="dialog" aria-modal="true" aria-label="Task details" style:--accent={accent}
      use:dialogFocus={{ onEscape: close, returnFocus }}
    >
      <div class="head">
        <button type="button" class="bx" class:done role="checkbox" aria-checked={done}
          aria-label="Done" onclick={() => void attempt(() => setDone(id, !done))}
        ></button>
        <input class="title" type="text" aria-label="Title" autocomplete="off" data-autofocus
          bind:this={titleEl} bind:value={titleDraft} oninput={onTitleInput} use:plainPaste
          onblur={() => {
            if (pending.title === undefined) titleDraft = task?.title ?? ''
          }}
        />
        <button type="button" class="x" aria-label="Close" onclick={close}>✕</button>
      </div>

      <div class="fields">
        <label class="fl" for="task-project">Project</label>
        <span class="fv">
          <select id="task-project" value={task.project_id ?? ''}
            onchange={(e) => void save({ project_id: e.currentTarget.value || null })}
          >
            <option value="">Unsorted</option>
            {#each projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
            {#if project && project.status !== 'active'}
              <option value={project.id}>{project.name} (closed)</option>
            {/if}
          </select>
        </span>

        <span class="fl" id="lbl-type">Task type</span>
        <span class="fv seg" role="group" aria-labelledby="lbl-type">
          {#each TASK_TYPES as t (t.key)}
            <button type="button" class:on={task.task_type === t.key} aria-pressed={task.task_type === t.key}
              onclick={() => void save({ task_type: t.key })}>{t.label}</button>
          {/each}
        </span>

        <span class="fl" id="lbl-status">Status</span>
        <span class="fv seg" role="group" aria-labelledby="lbl-status">
          {#each STATUSES as s (s)}
            <button type="button" class:on={task.status === s} class:blocked={s === 'blocked'}
              aria-pressed={task.status === s} onclick={() => void save({ status: s })}
            >{STATUS_LABELS[s]}</button>
          {/each}
        </span>

        <span class="fl" id="lbl-due">Due</span>
        <!-- svelte-ignore a11y_no_static_element_interactions (Esc closes the picker before the pop-up; captured because the dialog listens natively, ahead of Svelte's delegated handlers) -->
        <div class="due" onkeydowncapture={onDueKeydown}>
          <span class="fv">
            <button type="button" class="pill" aria-expanded={pickerOpen} bind:this={dueBtn}
              onclick={() => (pickerOpen = !pickerOpen)}
            >{task.due_date ? formatDue(task.due_date, app.today) : 'No date'}</button>
            {#if task.due_date}
              <button type="button" class="clear" aria-label="Clear due date"
                onclick={() => pickDate(null)}>✕</button>
            {/if}
          </span>
          {#if pickerOpen}<DatePicker value={task.due_date} onchange={pickDate} />{/if}
        </div>

        <span class="fl">Today</span>
        <span class="fv">
          <label class="switch">
            <input type="checkbox" role="switch" checked={isToday(task, app.today)}
              onchange={onToggleToday} />
            <span class="track" aria-hidden="true"></span>
            <span>On today's list</span>
          </label>
        </span>
      </div>

      <div class="fl dlabel" id="lbl-desc">Description</div>
      {#if editing}
        <textarea class="desc" aria-label="Description" bind:value={descDraft} oninput={onDescInput}
          onkeydown={onDescKeydown} onblur={endEditing} use:editor use:grow={descDraft}
          use:plainPaste={{ multiline: true }}
        ></textarea>
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (Enter on the box itself starts editing) -->
        <div class="desc view" role="group" aria-labelledby="lbl-desc" tabindex="0"
          onclick={startEditing}
          onkeydown={(e) => {
            if (e.key === 'Enter' && e.target === e.currentTarget) {
              e.preventDefault()
              startEditing(e)
            }
          }}
        >
          {#if descDraft}
            {#each linkify(descDraft) as seg, i (i)}
              {#if seg.kind === 'link'}<a href={seg.href} target="_blank" rel="noopener noreferrer">{seg.text}</a
                >{:else}{seg.text}{/if}
            {/each}
          {:else}
            <span class="muted">Add a description…</span>
          {/if}
        </div>
      {/if}

      <div class="foot">
        <span>{`Created ${formatShortDate(task.created_at)} · Updated ${formatStamp(task.updated_at)}`}</span>
        <button type="button" class="del" onclick={remove}>Delete</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    overflow-y: auto;
    padding: 38px 16px;
    box-sizing: border-box;
    background: rgba(47, 52, 55, 0.28);
  }
  .modal {
    box-sizing: border-box;
    width: min(560px, 100%);
    padding: 16px 18px;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18);
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
  }
  .bx {
    flex-shrink: 0;
    box-sizing: border-box;
    width: 16px;
    height: 16px;
    margin-top: 6px;
    padding: 0;
    border: 2px solid var(--accent, #9a9a9a);
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  .bx.done {
    background: var(--accent, #9a9a9a);
  }
  .title {
    flex: 1;
    min-width: 0;
    padding: 2px 4px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 1.35em;
    font-weight: 600;
  }
  .title:hover,
  .title:focus {
    border-color: #e3e0d9;
  }
  .x,
  .clear {
    border: 0;
    background: none;
    color: #aaa;
    font: inherit;
    cursor: pointer;
  }
  .x {
    font-size: 1.3em;
  }
  .fields {
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr);
    gap: 8px 10px;
    margin: 12px 0;
    align-items: start;
  }
  .fl {
    padding-top: 3px;
    color: #999;
    font-size: 0.88em;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .dlabel {
    margin-bottom: 5px;
  }
  .fv {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  select {
    font: inherit;
    padding: 2px 8px;
    border: 1px solid #e3e0d9;
    border-radius: 12px;
    background: #fbfaf8;
  }
  .seg button,
  .pill {
    padding: 1px 9px;
    border: 1px solid #e3e0d9;
    background: #fbfaf8;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .pill {
    border-radius: 12px;
  }
  .seg {
    gap: 0;
  }
  .seg button {
    margin-right: -1px;
  }
  .seg button:first-child {
    border-radius: 10px 0 0 10px;
  }
  .seg button:last-child {
    border-radius: 0 10px 10px 0;
    margin-right: 0;
  }
  .seg button.on {
    background: #ebe8e2;
    font-weight: 600;
  }
  .seg button.blocked.on {
    background: var(--blocked-bg);
    border-color: var(--blocked-fg);
    color: var(--blocked-fg);
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .switch input {
    position: absolute;
    opacity: 0;
  }
  .track {
    position: relative;
    width: 28px;
    height: 16px;
    border-radius: 8px;
    background: #d8d4cc;
  }
  .track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
  }
  input:checked + .track {
    background: #c9a94a;
  }
  input:checked + .track::after {
    left: 14px;
  }
  input:focus-visible + .track,
  .seg button:focus-visible,
  .view:focus-visible {
    outline: 2px solid #6b8fc2;
    outline-offset: 1px;
  }
  .desc {
    box-sizing: border-box;
    display: block;
    width: 100%;
    min-height: 120px;
    padding: 8px 10px;
    border: 1px solid #e3e0d9;
    border-radius: 6px;
    font: inherit;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  /* The one place text may scroll inside itself: a long description. */
  textarea.desc {
    max-height: 50vh;
    overflow-y: auto;
    resize: none;
  }
  .view {
    cursor: text;
  }
  .view a {
    color: #3d6fb0;
  }
  .muted {
    color: #aaa;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;
    color: #aaa;
    font-size: 0.92em;
  }
  .del {
    border: 0;
    background: none;
    color: #b55;
    font: inherit;
    cursor: pointer;
  }
</style>
