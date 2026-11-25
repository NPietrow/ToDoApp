<script lang="ts">
  // The due-date chip shared by Grid cards and Today rows. Overdue stands out, today keeps the
  // muted-orange chip, and later dates (and any done task) are quiet grey text.
  import { dueState, formatDue } from '../lib/dates'
  import { app } from '../lib/state.svelte'

  let { due, done }: { due: string; done: boolean } = $props()

  const state = $derived(done ? 'future' : dueState(due, app.today))
</script>

<span class="chip due" data-due={state}>{formatDue(due, app.today)}</span>

<style>
  .chip {
    flex-shrink: 0;
    padding: 0 6px;
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 0.84em;
    white-space: nowrap;
    color: var(--due-fg);
    background: var(--due-bg);
  }
  .chip[data-due='overdue'] {
    font-weight: 700;
    border-color: var(--due-overdue-border);
  }
  .chip[data-due='future'] {
    padding: 0 2px;
    color: var(--due-future-fg);
    background: transparent;
  }
</style>
