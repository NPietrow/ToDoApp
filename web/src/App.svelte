<script lang="ts">
  import { onMount } from 'svelte'
  import Grid from './components/Grid.svelte'
  import Toast from './components/Toast.svelte'
  import TaskModal from './components/TaskModal.svelte'
  import TopBar from './components/TopBar.svelte'
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
{:else}
  <p class="loading">Loading…</p>
{/if}
<Toast />

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .loading {
    margin: 16px;
    color: #a3a3a3;
  }
</style>
