<script lang="ts">
  // View tabs on the left, Grid actions on the right.
  import { onMount } from 'svelte'
  import { patchSettings } from '../lib/api'
  import { collapseAll, expandAll } from '../lib/collapse'
  import { app } from '../lib/state.svelte'
  import { showToast } from '../lib/toast.svelte'

  const LATER_VIEWS = ['Today', 'Kanban', 'Table', 'Stats']

  let header: HTMLElement

  // Publish the bar's real height (it wraps on narrow windows) for the sticky project headers,
  // and the visible page width (without the scrollbar) so the bar stays put when scrolling sideways.
  onMount(() => {
    const root = document.documentElement
    const publish = () => {
      root.style.setProperty('--topbar-h', `${header.offsetHeight}px`)
      root.style.setProperty('--vw', `${root.clientWidth}px`)
    }
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(header)
    observer.observe(root)
    return () => observer.disconnect()
  })

  async function toggleShowCompleted() {
    const value = !app.settings.show_completed
    app.settings.show_completed = value
    try {
      await patchSettings({ show_completed: value })
    } catch {
      app.settings.show_completed = !value
      showToast({ message: 'Could not save Show completed. Try again.' })
    }
  }
</script>

<header class="top" bind:this={header}>
  <nav class="views" aria-label="Views">
    <button type="button" class="view on" aria-current="page">Grid</button>
    {#each LATER_VIEWS as view (view)}
      <button type="button" class="view" disabled title="Coming in a later stage">{view}</button>
    {/each}
  </nav>

  <div class="actions">
    <!-- Later tasks add their top-bar buttons here, before Show completed:
         Paste tasks, the Unsorted and problems badges, and Settings (Task 17). -->
    <button type="button" class="btn" onclick={expandAll}>Expand all</button>
    <button
      type="button"
      class="btn"
      onclick={() =>
        collapseAll(
          app.projects
            .filter((p) => p.status === 'active')
            .sort((a, b) => a.position - b.position)
            .map((p) => p.id),
        )}
      >Collapse all</button
    >
    <button
      type="button"
      class="btn"
      class:on={app.settings.show_completed}
      aria-pressed={app.settings.show_completed}
      onclick={toggleShowCompleted}>Show completed</button
    >
  </div>
</header>

<style>
  .top {
    position: sticky;
    top: 0;
    left: 0;
    z-index: 4;
    box-sizing: border-box;
    width: var(--vw, 100vw);
    background: var(--bg);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 14px 16px 12px;
  }
  .views {
    display: flex;
    gap: 2px;
  }
  .view {
    padding: 4px 12px;
    border: 0;
    border-radius: 14px;
    background: none;
    color: #7d7d7d;
    font: inherit;
    font-weight: 600;
  }
  .view.on {
    background: var(--text);
    color: #fff;
  }
  .view:disabled {
    color: #b5b5b5;
    cursor: default;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-left: auto;
  }
  .btn.on {
    background: var(--text);
    border-color: var(--text);
    color: #fff;
  }
</style>
