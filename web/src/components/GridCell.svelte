<script lang="ts">
  // One project × task type cell: the visible tasks, in `order`. Ends with the "+ add" line,
  // hidden in picking mode, where a click means only pick.
  import { moveTask } from '../lib/api'
  import { isVisibleOnGrid } from '../lib/dates'
  import { dropIndex } from '../lib/dnd'
  import { colourOf } from '../lib/palette'
  import { app, refresh } from '../lib/state.svelte'
  import { showToast } from '../lib/toast.svelte'
  import type { TaskType } from '../lib/types'
  import { ui } from '../lib/ui.svelte'
  import AddLine from './AddLine.svelte'
  import TaskItem from './TaskItem.svelte'

  let { projectId, taskType }: { projectId: string; taskType: TaskType } = $props()

  const colours = $derived(colourOf(app.projects.find((p) => p.id === projectId)?.colour))
  const tasks = $derived(
    app.tasks
      .filter(
        (t) =>
          t.project_id === projectId &&
          t.task_type === taskType &&
          isVisibleOnGrid(t, app.today, app.settings.show_completed),
      )
      .sort((a, b) => a.order - b.order),
  )

  // Drop target. `depth` counts dragenter minus dragleave so child elements don't flicker
  // the outline off.
  let depth = $state(0)
  let cellEl: HTMLElement | undefined = $state()
  const hasTask = (e: DragEvent) => !!e.dataTransfer?.types.includes('text/x-task-id')

  function onDragOver(e: DragEvent) {
    if (!hasTask(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }
  function onDragEnter(e: DragEvent) {
    if (hasTask(e)) depth++
  }
  function onDragLeave(e: DragEvent) {
    if (hasTask(e) && depth > 0) depth--
  }

  async function onDrop(e: DragEvent) {
    depth = 0
    const id = e.dataTransfer?.getData('text/x-task-id')
    const task = id ? app.tasks.find((t) => t.id === id) : undefined
    if (!task || !cellEl) return
    e.preventDefault()
    const full = app.tasks
      .filter((t) => t.project_id === projectId && t.task_type === taskType && t.id !== task.id)
      .sort((a, b) => a.order - b.order)
      .map((t) => t.id)
    const cards = [...cellEl.querySelectorAll<HTMLElement>('[data-task-id]')]
      .filter((c) => c.dataset.taskId !== task.id)
      .map((c) => {
        const r = c.getBoundingClientRect()
        return { id: c.dataset.taskId!, mid: (r.top + r.bottom) / 2 }
      })
    const index = dropIndex(cards, full, e.clientY)
    if (task.project_id === projectId && task.task_type === taskType) {
      const current = app.tasks
        .filter((t) => t.project_id === projectId && t.task_type === taskType)
        .sort((a, b) => a.order - b.order)
        .findIndex((t) => t.id === task.id)
      if (index === current) return
    }
    try {
      await moveTask(task.id, projectId, taskType, index)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      showToast({ message: `Couldn't move task: ${reason}` })
      return
    }
    void refresh()
  }
</script>

<!-- svelte-ignore a11y_interactive_supports_focus (a drop target, not a control) -->
<div class="cell" class:over={depth > 0} role="gridcell" bind:this={cellEl}
  ondragover={onDragOver} ondragenter={onDragEnter} ondragleave={onDragLeave} ondrop={onDrop}
  style:background={colours.tint} style:--accent={colours.accent}>
  {#each tasks as task (task.id)}
    <TaskItem {task} />
  {/each}
  <!-- Hidden, not removed, while picking, so half-typed text survives. -->
  <div class="add-slot" hidden={ui.picking}><AddLine {projectId} {taskType} /></div>
</div>

<style>
  .cell {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
    min-height: 40px;
    padding: 6px 8px;
    box-sizing: border-box;
  }
  /* The add line lays out as if it were the cell's own child. */
  .add-slot {
    display: contents;
  }
  .add-slot[hidden] {
    display: none;
  }
  .over {
    outline: 2px dashed var(--accent, #9a9a9a);
    outline-offset: -2px;
  }
</style>
