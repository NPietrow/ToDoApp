<script lang="ts">
  // A project's column header. Clicking the name collapses the column; Task 15 adds its menu.
  import { toggleProject } from '../lib/collapse'
  import { colourOf } from '../lib/palette'
  import type { Project } from '../lib/types'

  let { project }: { project: Project } = $props()
</script>

<div class="ph" role="columnheader" style:background={colourOf(project.colour).header}>
  <button type="button" class="name" aria-expanded="true" onclick={() => toggleProject(project.id)}>
    {project.name}
  </button>
</div>

<style>
  .name {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
  }
  .ph {
    position: sticky;
    top: 0;
    z-index: 2;
    min-width: 0;
    padding: 9px 12px;
    border-radius: 10px 10px 0 0;
    font-size: 1.12em;
    font-weight: 700;
    overflow-wrap: anywhere;
    /* Paint the gaps beside and below the pinned header so cells don't show through. */
    box-shadow:
      6px 0 0 var(--bg),
      0 6px 0 var(--bg),
      6px 6px 0 var(--bg);
  }
</style>
