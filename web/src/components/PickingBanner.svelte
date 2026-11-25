<script lang="ts">
  // The picking-mode banner under the top bar: how many open tasks are picked for today, and the
  // way out (Done planning, or Escape when no pop-up, dialog or menu has it).
  import { endPicking } from '../lib/picking'
  import { app } from '../lib/state.svelte'
  import { todayTasks } from '../lib/today'
  import { ui } from '../lib/ui.svelte'
  import PinIcon from './PinIcon.svelte'

  const count = $derived(todayTasks(app.tasks, app.today).length)

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if (ui.openTaskId || ui.modal || ui.contextMenu) return
    e.preventDefault()
    void endPicking()
  }
</script>

<svelte:window {onkeydown} />

<section class="wrap" aria-label="Picking for today">
  <div class="banner">
    <span class="icon"><PinIcon filled={true} /></span>
    <span class="text"><b>Picking for today</b>: {count} picked · click a task to add or remove it · Esc to finish</span>
    <button type="button" class="btn primary" onclick={() => void endPicking()}>Done planning</button>
  </div>
</section>

<style>
  /* Pinned to the left like the top bar, so it stays in view when the Grid scrolls sideways. */
  .wrap {
    position: sticky;
    left: 0;
    box-sizing: border-box;
    width: var(--vw, 100vw);
    padding: 0 16px 8px;
  }
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 6px 8px 6px 12px;
    border: 1px solid #eedca8;
    border-radius: 8px;
    background: #fff8e6;
  }
  .icon {
    font-size: 14px;
  }
  .text {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
