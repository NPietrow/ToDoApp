<script lang="ts">
  // A project's column header. Task 13 makes it collapse the column, Task 15 adds its menu.
  import { colourOf } from '../lib/palette'
  import type { Project } from '../lib/types'

  let { project }: { project: Project } = $props()
</script>

<div class="ph" role="columnheader" style:background={colourOf(project.colour).header}>
  {project.name}
</div>

<style>
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
