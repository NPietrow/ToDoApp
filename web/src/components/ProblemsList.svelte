<script lang="ts">
  // Files the server couldn't read. They are only reported here, never changed or deleted.
  // Items skipped from an imported inbox file are listed apart: that file was imported and moved
  // to inbox/processed/, and its entries stay until the processed file is removed.
  import { app } from '../lib/state.svelte'
  import type { FileProblem } from '../lib/types'
  import Modal from './Modal.svelte'

  const isImport = (p: FileProblem) => p.file.startsWith('inbox/processed/')
  const files = $derived(app.problems.filter((p) => !isImport(p)))
  const imports = $derived(app.problems.filter(isImport))
</script>

{#snippet list(problems: FileProblem[])}
  <ul>
    {#each problems as p, i (i)}
      <li>
        <span class="file">{p.file}</span>
        <span class="err">{p.error}</span>
      </li>
    {/each}
  </ul>
{/snippet}

<Modal name="problems" title="File problems">
  {#if files.length}
    <p class="hint">Fix or remove these files in your data folder. Nothing has been changed.</p>
    {@render list(files)}
  {/if}
  {#if imports.length}
    <p class="hint" class:gap={files.length > 0}>
      Imported the valid items; the ones listed were skipped. Remove the processed file to clear this.
    </p>
    {@render list(imports)}
  {/if}
</Modal>

<style>
  .hint {
    margin: 0 0 10px;
    color: #7d7d7d;
  }
  .hint.gap {
    margin-top: 16px;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    padding: 6px 0;
    border-bottom: 1px solid #f0ede8;
    overflow-wrap: anywhere;
  }
  .file {
    display: block;
    font-weight: 600;
  }
  .err {
    color: var(--blocked-fg);
  }
</style>
