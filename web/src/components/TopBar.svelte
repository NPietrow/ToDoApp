<script lang="ts">
  // View tabs on the left, actions on the right. Expand all, Collapse all and Show completed act
  // on the Grid, so they show only there.
  import { onMount } from 'svelte'
  import { patchSettings } from '../lib/api'
  import { collapseAll, expandAll } from '../lib/collapse'
  import { endPicking, startPicking } from '../lib/picking'
  import { app, unsortedTasks } from '../lib/state.svelte'
  import { showToast } from '../lib/toast.svelte'
  import { ui, type Modal, type View } from '../lib/ui.svelte'

  const VIEWS: { key: View; label: string }[] = [
    { key: 'grid', label: 'Grid' },
    { key: 'today', label: 'Today' },
  ]
  const LATER_VIEWS = ['Kanban', 'Table', 'Stats']

  let header: HTMLElement

  const unsortedCount = $derived(unsortedTasks().length)
  const problemCount = $derived(app.problems.length)
  const open = (m: Modal) => (ui.modal = m)

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
    // The bar's own width props up the page, so the observed boxes may not change when the window
    // narrows: follow the window directly as well.
    window.addEventListener('resize', publish)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', publish)
    }
  })

  function show(view: View) {
    // A view tab also leaves picking mode, and counts as leaving it for the planning log.
    if (ui.picking) {
      void endPicking(view)
      return
    }
    // A menu opened on one view has nothing to point at on the other.
    ui.contextMenu = null
    ui.view = view
  }

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
    {#each VIEWS as view (view.key)}
      <button type="button" class="view" class:on={ui.view === view.key}
        aria-current={ui.view === view.key ? 'page' : undefined} onclick={() => show(view.key)}
        >{view.label}</button
      >
    {/each}
    {#each LATER_VIEWS as view (view)}
      <button type="button" class="view" disabled title="Coming in a later stage">{view}</button>
    {/each}
  </nav>

  <div class="actions">
    {#if !ui.picking}<button type="button" class="btn" onclick={startPicking}>Plan today</button>{/if}
    <button type="button" class="btn" data-modal-button="paste" onclick={() => open('paste')}>Paste tasks</button>
    {#if unsortedCount > 0}
      <button type="button" class="btn" data-modal-button="unsorted" onclick={() => open('unsorted')}
        >Unsorted ({unsortedCount})</button
      >
    {/if}
    {#if problemCount > 0}
      <button type="button" class="btn warn" data-modal-button="problems" onclick={() => open('problems')}
        >⚠ {problemCount} file {problemCount === 1 ? 'problem' : 'problems'}</button
      >
    {/if}
    <button type="button" class="btn" data-modal-button="settings" onclick={() => open('settings')}>Settings</button>
    {#if ui.view === 'grid'}
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
    {/if}
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
  .btn.warn {
    background: var(--due-bg);
    border-color: var(--due-fg);
    color: var(--due-fg);
  }
  .btn.on {
    background: var(--text);
    border-color: var(--text);
    color: #fff;
  }
</style>
