<script lang="ts">
  import { onMount } from 'svelte'
  import Grid from './components/Grid.svelte'
  import PasteTasksModal from './components/PasteTasksModal.svelte'
  import ProblemsList from './components/ProblemsList.svelte'
  import SettingsModal from './components/SettingsModal.svelte'
  import Toast from './components/Toast.svelte'
  import TaskModal from './components/TaskModal.svelte'
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
  <div class="app">
    <TopBar />
    <Grid />
  </div>
  {#if ui.openTaskId}{#key ui.openTaskId}<TaskModal />{/key}{/if}
  {#if ui.modal === 'paste'}<PasteTasksModal />
  {:else if ui.modal === 'settings'}<SettingsModal />
  {:else if ui.modal === 'unsorted'}<UnsortedTray />
  {:else if ui.modal === 'problems'}<ProblemsList />{/if}
{:else if app.loadError}
  <div class="load-error" role="alert">
    <p>Couldn't load the board: {app.loadError}</p>
    <button type="button" class="btn" onclick={() => void refresh()}>Retry</button>
  </div>
{:else}
  <p class="loading">Loading…</p>
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
  .load-error {
    margin: 16px;
    overflow-wrap: anywhere;
  }
  .load-error p {
    margin: 0 0 8px;
    color: var(--blocked-fg);
  }
</style>
