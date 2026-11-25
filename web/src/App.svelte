<script lang="ts">
  import { onMount } from 'svelte'
  import Grid from './components/Grid.svelte'
  import PasteTasksModal from './components/PasteTasksModal.svelte'
  import PickingBanner from './components/PickingBanner.svelte'
  import ProblemsList from './components/ProblemsList.svelte'
  import SettingsModal from './components/SettingsModal.svelte'
  import Toast from './components/Toast.svelte'
  import TaskModal from './components/TaskModal.svelte'
  import TodayView from './components/TodayView.svelte'
  import TopBar from './components/TopBar.svelte'
  import UnsortedTray from './components/UnsortedTray.svelte'
  import { app, connectEvents, refresh, startDayWatch } from './lib/state.svelte'
  import type { TextSize } from './lib/types'
  import { ui } from './lib/ui.svelte'

  const BASE_SIZES: Record<TextSize, string> = { small: '11.5px', medium: '12.5px', large: '14px' }

  onMount(() => {
    // Listen first, so a change made while the first fetch is in flight isn't missed.
    const stopEvents = connectEvents()
    void refresh()
    const stopDayWatch = startDayWatch()
    return () => {
      stopEvents()
      stopDayWatch()
    }
  })

  $effect(() => {
    document.documentElement.style.setProperty(
      '--base-size',
      BASE_SIZES[app.settings.text_size] ?? BASE_SIZES.medium,
    )
  })
</script>

{#if app.loaded}
  <!-- While the server is away the board is covered and inert, not removed: removing it would
       throw away a half-typed note or task if the "stopped" check was a false alarm. -->
  <div class="board" inert={app.serverStopped}>
    <div class="app">
      <TopBar />
      {#if ui.picking}<PickingBanner />{/if}
      {#if ui.view === 'today'}<TodayView />{:else}<Grid />{/if}
    </div>
    {#if ui.openTaskId}{#key ui.openTaskId}<TaskModal />{/key}{/if}
    {#if ui.modal === 'paste'}<PasteTasksModal />
    {:else if ui.modal === 'settings'}<SettingsModal />
    {:else if ui.modal === 'unsorted'}<UnsortedTray />
    {:else if ui.modal === 'problems'}<ProblemsList />{/if}
  </div>
{:else if app.loadError}
  <div class="load-error" role="alert">
    <p>Couldn't load the board: {app.loadError}</p>
    <button type="button" class="btn" onclick={() => void refresh()}>Retry</button>
  </div>
{:else}
  <p class="loading">Loading…</p>
{/if}
{#if app.serverStopped}
  <div class="stopped" role="alert">
    <p><strong>ToDoApp isn't running.</strong> Start it again and this window reconnects by itself.</p>
    <p class="muted">Saved tasks are safe. Changes made since it stopped may not have been saved.</p>
  </div>
{/if}
<Toast />

<style>
  .app {
    /* As wide as the board's min-content (200px columns), but never narrower than the window, so
       the page scrolls sideways only when the columns no longer fit, with the pinned parts working.
       Not max-content: that stretches the 1fr columns to the unwrapped width of long titles. */
    width: fit-content;
    min-width: 100%;
  }
  .loading {
    margin: 16px;
    color: #a3a3a3;
  }
  .board {
    display: contents;
  }
  .stopped {
    position: fixed;
    inset: 0;
    z-index: 200; /* above modals (10), menus (50) and the toast (100) */
    background: var(--bg);
    padding: 16px;
    overflow-wrap: anywhere;
  }
  .stopped p {
    margin: 0 0 8px;
    color: var(--blocked-fg);
  }
  .stopped p.muted {
    color: #737373;
  }
  .load-error {
    margin: 16px;
    overflow-wrap: anywhere;
  }
  .load-error p {
    margin: 0 0 8px;
    color: var(--blocked-fg);
  }
</style>
