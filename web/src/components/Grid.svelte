<script lang="ts">
  // The Grid: active projects as columns (by position), task types as rows, then Notes.
  // With no active projects it shows the empty board instead.
  import { toggleRow } from '../lib/collapse'
  import { colourOf } from '../lib/palette'
  import { closeProjectNow, projectMenuItems, taskMenuItems } from '../lib/menus'
  import { app } from '../lib/state.svelte'
  import { TASK_TYPES, type Project, type RowKey } from '../lib/types'
  import { ui } from '../lib/ui.svelte'
  import CloseProjectDialog from './CloseProjectDialog.svelte'
  import ContextMenu from './ContextMenu.svelte'
  import CollapsedColumn from './CollapsedColumn.svelte'
  import GridCell from './GridCell.svelte'
  import NotesCell from './NotesCell.svelte'
  import ProjectHeader from './ProjectHeader.svelte'
  import ProjectNameDialog from './ProjectNameDialog.svelte'

  const projects = $derived(
    app.projects.filter((p) => p.status === 'active').sort((a, b) => a.position - b.position),
  )
  // Ids in collapsed_projects that aren't active projects collapse nothing.
  const collapsedIds = $derived(new Set(app.settings.collapsed_projects))
  const isCollapsed = (id: string) => collapsedIds.has(id)
  const expanded = $derived(projects.filter((p) => !isCollapsed(p.id)))
  const columns = $derived(
    'calc(var(--label-w, 90px) + 16px) ' +
      projects.map((p) => (isCollapsed(p.id) ? '38px' : 'minmax(200px, 1fr)')).join(' '),
  )
  const rowCount = TASK_TYPES.length + 2 // header, task types, Notes

  const collapsedRows = $derived(new Set<RowKey>(app.settings.collapsed_rows))

  function openCount(projectId: string, type: string): number {
    return app.tasks.filter(
      (t) => t.project_id === projectId && t.task_type === type && t.status !== 'done',
    ).length
  }
  function noteCount(projectId: string): number {
    return (app.notes[projectId] ?? '').split('\n').filter((l) => l.trim() !== '').length
  }

  type Dialog =
    | { kind: 'create'; position?: number }
    | { kind: 'rename'; project: Project }
    | { kind: 'close'; project: Project }
  let dialog: Dialog | null = $state(null)

  // The one open context menu, built from what was right-clicked. A target that has since
  // vanished (deleted elsewhere) shows no menu.
  const menu = $derived.by(() => {
    const cm = ui.contextMenu
    if (!cm) return null
    if (cm.kind === 'task') {
      const task = app.tasks.find((t) => t.id === cm.id)
      if (!task) return null
      return {
        items: taskMenuItems(task, {
          projects,
          tasks: app.tasks,
          today: app.today,
          openTask: (id) => (ui.openTaskId = id),
        }),
      }
    }
    const index = projects.findIndex((p) => p.id === cm.id)
    if (index < 0) return null
    const project = projects[index]
    return {
      items: projectMenuItems(project, index, projects.length, {
        insertAt: (position) => (dialog = { kind: 'create', position }),
        rename: () => (dialog = { kind: 'rename', project }),
        close: () => {
          const open = app.tasks.some((t) => t.project_id === project.id && t.status !== 'done')
          if (open) dialog = { kind: 'close', project }
          else void closeProjectNow(project.id)
        },
      }),
    }
  })
</script>

{#if projects.length === 0}
  <div class="empty">
    <p>No projects yet</p>
    <button type="button" class="btn" onclick={() => (dialog = { kind: 'create' })}>
      Create your first project
    </button>
  </div>
{:else}
  <div class="grid-scroll"><div class="board">
    <div class="grid" class:all-collapsed={expanded.length === 0} role="grid" aria-label="Grid"
      style:grid-template-columns={columns}>
      <div role="row" style="display:contents">
        <div class="corner"></div>
        {#each expanded as project (project.id)}
          <ProjectHeader {project} />
        {/each}
        <!-- Collapsed columns: one strip each, placed explicitly; the other cells flow around it. -->
        {#each projects as project, i (project.id)}
          {#if isCollapsed(project.id)}
            <CollapsedColumn {project} column={i + 2} rows={rowCount} />
          {/if}
        {/each}
      </div>

      {#each TASK_TYPES as type (type.key)}
        <div role="row" aria-label={type.label} style="display:contents">
          <div class="rl" class:collapsed={collapsedRows.has(type.key)} role="rowheader">
            <button type="button" class="rlb" onclick={() => toggleRow(type.key)}>{type.label}</button>
          </div>
          {#each expanded as project (project.id)}
            {#if collapsedRows.has(type.key)}
              <div class="cell bar" role="gridcell" style:background={colourOf(project.colour).tint}>
                <button type="button" class="barb" onclick={() => toggleRow(type.key)}
                  >{openCount(project.id, type.key)} open</button
                >
              </div>
            {:else}
              <GridCell projectId={project.id} taskType={type.key} />
            {/if}
          {/each}
        </div>
      {/each}

      <div role="row" aria-label="Notes" style="display:contents">
        <div class="rl" class:collapsed={collapsedRows.has('notes')} role="rowheader">
          <button type="button" class="rlb" onclick={() => toggleRow('notes')}>Notes</button>
        </div>
        {#each expanded as project (project.id)}
          {#if collapsedRows.has('notes')}
            <div class="cell bar" role="gridcell" style:background={colourOf(project.colour).tint}>
              <button type="button" class="barb" onclick={() => toggleRow('notes')}
                >{noteCount(project.id)} notes</button
              >
            </div>
          {:else}
            <div class="cell notes" role="gridcell" style:background={colourOf(project.colour).tint}>
              <NotesCell projectId={project.id} />
            </div>
          {/if}
        {/each}
      </div>
    </div>
    <button type="button" class="addproj" onclick={() => (dialog = { kind: 'create', position: projects.length })}
      >+ project</button
    >
  </div></div>
{/if}

{#if ui.contextMenu && menu}
  {#key ui.contextMenu}
    <ContextMenu items={menu.items} x={ui.contextMenu.x} y={ui.contextMenu.y}
      onclose={() => (ui.contextMenu = null)} />
  {/key}
{/if}

{#if dialog?.kind === 'create'}
  <ProjectNameDialog mode="create" position={dialog.position} onClose={() => (dialog = null)} />
{:else if dialog?.kind === 'rename'}
  <ProjectNameDialog mode="rename" projectId={dialog.project.id} initialName={dialog.project.name}
    onClose={() => (dialog = null)} />
{:else if dialog?.kind === 'close'}
  <CloseProjectDialog projectId={dialog.project.id} onClose={() => (dialog = null)} />
{/if}

<style>
  /* The page itself scrolls, both ways: nothing here sets overflow. The top bar is pinned at the
     top, and the project headers and row labels stick beneath and beside it. Cells never scroll
     themselves. The left gutter is the row labels' own padding, so a pinned label covers it. */
  .grid-scroll {
    padding: 0 16px 16px 0;
  }
  .board {
    display: flex;
    align-items: flex-start;
  }
  .addproj {
    position: sticky;
    top: var(--topbar-h, 48px);
    z-index: 2;
    flex: none;
    margin-left: 6px;
    padding: 9px 12px;
    border: 1px dashed #c9c4b9;
    border-radius: 10px;
    background: none;
    color: #8a8a8a;
    font: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .addproj:hover {
    color: var(--text);
    border-color: #9a9a9a;
  }
  .grid {
    flex: 1 1 auto;
    display: grid;
    gap: 6px;
    align-items: stretch;
  }
  /* Every column collapsed: don't stretch, so + project sits right after the last strip. */
  .grid.all-collapsed {
    flex: 0 0 auto;
  }
  /* Pinned label and corner: an opaque box that also covers the gap beside it (a border in the
     gap colour, pulled into the gap by a negative margin) so scrolled cells don't show through. */
  .corner {
    position: sticky;
    top: var(--topbar-h, 48px);
    left: 0;
    z-index: 3;
    margin: 0 -6px -6px 0;
    border-right: 6px solid var(--bg);
    border-bottom: 6px solid var(--bg);
    background: var(--bg);
  }
  .rl {
    position: sticky;
    left: 0;
    z-index: 1;
    margin: 0 -6px -6px 0;
    padding: 12px 4px 12px 20px;
    border-right: 6px solid var(--bg);
    border-bottom: 6px solid var(--bg);
    background: var(--bg);
    color: #a3a3a3;
    font-size: 0.84em;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  /* A collapsed row is slim: the label must not set the row height. */
  .rl.collapsed {
    padding-top: 4px;
    padding-bottom: 4px;
  }
  .rlb {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    cursor: pointer;
  }
  .barb {
    display: block;
    width: 100%;
    padding: 4px 10px;
    border: 0;
    background: none;
    color: #555;
    font: inherit;
    font-size: 0.84em;
    line-height: 1.3;
    text-align: left;
    cursor: pointer;
  }
  .cell {
    min-width: 0;
    min-height: 40px;
    padding: 6px 8px;
    box-sizing: border-box;
  }
  /* After .cell, and more specific, so the slim bar beats the cell's min-height and padding. */
  .cell.bar {
    min-height: 0;
    padding: 0;
  }
  .notes {
    padding: 0;
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
