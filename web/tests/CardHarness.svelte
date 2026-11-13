<script lang="ts">
  // Stands in for Task 16: a Svelte click handler on an ancestor of the task card.
  import TaskItem from '../src/components/TaskItem.svelte'
  import type { Task } from '../src/lib/types'

  let { task, onCardClick }: { task: Task; onCardClick: () => void } = $props()
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div onclick={onCardClick}><TaskItem {task} /></div>
