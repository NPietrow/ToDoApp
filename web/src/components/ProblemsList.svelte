<script lang="ts">
  // Files the server couldn't read. They are only reported here, never changed or deleted.
  import { app } from '../lib/state.svelte'
  import Modal from './Modal.svelte'
</script>

<Modal name="problems" title="File problems">
  <p class="hint">Fix or remove these files in your data folder. Nothing has been changed.</p>
  <ul>
    {#each app.problems as p, i (i)}
      <li>
        <span class="file">{p.file}</span>
        <span class="err">{p.error}</span>
      </li>
    {/each}
  </ul>
</Modal>

<style>
  .hint {
    margin: 0 0 10px;
    color: #7d7d7d;
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
