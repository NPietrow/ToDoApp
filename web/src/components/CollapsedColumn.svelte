<script lang="ts">
  // A collapsed project: a 38px strip in the header colour, spanning the header and every row.
  // Shows the open-task count and the name written vertically. Click to expand.
  import { toggleProject } from '../lib/collapse'
  import { colourOf } from '../lib/palette'
  import { app } from '../lib/state.svelte'
  import type { Project } from '../lib/types'

  let { project, column, rows }: { project: Project; column: number; rows: number } = $props()

  const open = $derived(
    app.tasks.filter((t) => t.project_id === project.id && t.status !== 'done').length,
  )
</script>

<button
  type="button"
  class="strip"
  aria-label="Expand {project.name}"
  style:background={colourOf(project.colour).header}
  style:grid-column={column}
  style:grid-row="1 / {rows + 1}"
  onclick={() => toggleProject(project.id)}
>
  <span class="count">{open}</span>
  <span class="name">{project.name}</span>
</button>

<style>
  .strip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 9px 0;
    border: 0;
    border-radius: 10px;
    color: var(--text);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .count {
    flex: none;
  }
  .name {
    writing-mode: vertical-rl;
    overflow-wrap: anywhere;
  }
</style>
