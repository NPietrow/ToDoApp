<script lang="ts">
  // The capture path: a faint "+ add" that becomes a text box. Type, press Enter, and the
  // box stays open and focused for the next task. Capture is optimistic: the box clears at
  // once, and the text only comes back if the server refuses it.
  import { tick } from 'svelte'
  import { createTask } from '../lib/api'
  import { plainPaste } from '../lib/paste'
  import { refresh } from '../lib/state.svelte'
  import { showToast } from '../lib/toast.svelte'
  import { singleLine } from '../lib/text'
  import type { TaskType } from '../lib/types'

  let { projectId, taskType }: { projectId: string; taskType: TaskType } = $props()

  let open = $state(false)
  let value = $state('')
  let input: HTMLInputElement | undefined = $state()

  async function openInput() {
    open = true
    await tick()
    input?.focus()
  }

  function close() {
    open = false
    value = ''
  }

  async function submit() {
    const title = singleLine(value)
    if (!title) return
    value = ''
    try {
      await createTask(title, projectId, taskType)
      void refresh()
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      showToast({ message: `Couldn't add task: ${reason}` })
      if (value === '') value = title
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  function onBlur() {
    // Keep typed text: only an empty box closes itself.
    if (value.trim() === '') close()
  }
</script>

{#if open}
  <input
    bind:this={input}
    bind:value
    use:plainPaste
    class="field"
    type="text"
    aria-label="New task"
    autocomplete="off"
    onkeydown={onKeydown}
    onblur={onBlur}
  />
{:else}
  <button type="button" class="add" onclick={openInput}>+ add</button>
{/if}

<style>
  .add {
    align-self: flex-start;
    padding: 2px 4px;
    border: none;
    background: none;
    color: #a3a3a3;
    font: inherit;
    cursor: pointer;
  }
  .add:hover,
  .add:focus-visible {
    color: #666;
  }
  .field {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 9px;
    border: 1px solid var(--accent, #9a9a9a);
    border-radius: 8px;
    background: #fff;
    font: inherit;
  }
</style>
