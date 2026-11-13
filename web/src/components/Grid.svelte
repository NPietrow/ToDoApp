<script lang="ts">
  // The Grid: active projects as columns (by position), task types as rows, then Notes.
  // With no active projects it shows the empty board instead.
  import { colourOf } from '../lib/palette'
  import { app } from '../lib/state.svelte'
  import { linkify } from '../lib/text'
  import { TASK_TYPES } from '../lib/types'
  import GridCell from './GridCell.svelte'
  import ProjectHeader from './ProjectHeader.svelte'
  import ProjectNameDialog from './ProjectNameDialog.svelte'

  const projects = $derived(
    app.projects.filter((p) => p.status === 'active').sort((a, b) => a.position - b.position),
  )
  const columns = $derived(
    `var(--label-w, 90px) repeat(${projects.length}, minmax(200px, 1fr))`,
  )

  let creating = $state(false)
</script>

{#if projects.length === 0}
  <div class="empty">
    <p>No projects yet</p>
    <button type="button" class="btn" onclick={() => (creating = true)}>
      Create your first project
    </button>
  </div>
{:else}
  <div class="grid-scroll">
    <div class="grid" role="grid" aria-label="Grid" style:grid-template-columns={columns}>
      <div role="row" style="display:contents">
        <div class="corner"></div>
        {#each projects as project (project.id)}
          <ProjectHeader {project} />
        {/each}
      </div>

      {#each TASK_TYPES as type (type.key)}
        <div role="row" aria-label={type.label} style="display:contents">
          <div class="rl" role="rowheader">{type.label}</div>
          {#each projects as project (project.id)}
            <GridCell projectId={project.id} taskType={type.key} />
          {/each}
        </div>
      {/each}

      <!-- Read-only for now: Task 17 replaces these cells with the editable NotesCell. -->
      <div role="row" aria-label="Notes" style="display:contents">
        <div class="rl" role="rowheader">Notes</div>
        {#each projects as project (project.id)}
          <div class="cell notes" role="gridcell" style:background={colourOf(project.colour).tint}>
            {#each linkify(app.notes[project.id] ?? '') as seg, i (i)}
              {#if seg.kind === 'link'}
                <a href={seg.href} target="_blank" rel="noopener noreferrer">{seg.text}</a>
              {:else}{seg.text}{/if}
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

{#if creating}
  <ProjectNameDialog mode="create" onClose={() => (creating = false)} />
{/if}

<style>
  /* The board fills the space under the top bar and scrolls both ways, so the project headers
     (sticky top) and row labels (sticky left) stay pinned. Cells never scroll themselves. */
  .grid-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: auto;
    overflow-y: auto;
    padding: 0 16px 16px;
  }
  .grid {
    display: grid;
    gap: 6px;
    align-items: stretch;
  }
  .corner {
    position: sticky;
    top: 0;
    left: 0;
    z-index: 3;
    background: var(--bg);
    /* Cover the gutter to the left and the gap below, so scrolled cells don't show through. */
    box-shadow:
      -16px 0 0 var(--bg),
      0 6px 0 var(--bg),
      -16px 6px 0 var(--bg),
      6px 0 0 var(--bg),
      6px 6px 0 var(--bg);
  }
  .rl {
    position: sticky;
    left: 0;
    z-index: 1;
    padding: 12px 4px;
    background: var(--bg);
    /* Cover the gutter to the left and the gap to the right while pinned. */
    box-shadow:
      -16px 0 0 var(--bg),
      6px 0 0 var(--bg);
    color: #a3a3a3;
    font-size: 0.84em;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .cell {
    min-width: 0;
    min-height: 40px;
    padding: 6px 8px;
    box-sizing: border-box;
  }
  .notes {
    padding: 6px 10px;
    color: #555;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .notes a {
    color: inherit;
  }
  .empty {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 48px 16px;
    color: #7d7d7d;
  }
  .empty p {
    margin: 0 0 8px;
    font-size: 1.12em;
    font-weight: 600;
    color: var(--text);
  }
</style>
