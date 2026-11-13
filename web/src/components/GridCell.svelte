<script lang="ts">
  // One project × task type cell: the visible tasks, in `order`. Ends with the "+ add" line.
  import { isVisibleOnGrid } from '../lib/dates'
  import { colourOf } from '../lib/palette'
  import { app } from '../lib/state.svelte'
  import type { TaskType } from '../lib/types'
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
</script>

<div class="cell" role="gridcell" style:background={colours.tint} style:--accent={colours.accent}>
  {#each tasks as task (task.id)}
    <TaskItem {task} />
  {/each}
  <AddLine {projectId} {taskType} />
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
</style>
