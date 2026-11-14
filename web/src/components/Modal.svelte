<script lang="ts">
  // The shared shell for the top-bar modals: backdrop, title, ✕, Escape, focus handling.
  // Closing (Esc, ✕, a click on the backdrop) sets ui.modal back to null; focus returns to
  // the top-bar button that opened it.
  import type { Snippet } from 'svelte'
  import { dialogFocus } from '../lib/dialog'
  import { ui, type Modal } from '../lib/ui.svelte'

  let { name, title, children }: { name: Modal; title: string; children: Snippet } = $props()

  const close = () => (ui.modal = null)
  const returnFocus = () => document.querySelector<HTMLElement>(`[data-modal-button="${name}"]`)
  let downOnBackdrop = false
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Esc closes; the backdrop click is a mouse shortcut) -->
<div class="backdrop"
  onmousedown={(e) => (downOnBackdrop = e.target === e.currentTarget)}
  onclick={(e) => {
    if (downOnBackdrop && e.target === e.currentTarget) close()
  }}
>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title}
    use:dialogFocus={{ onEscape: close, returnFocus }}
  >
    <div class="head">
      <h2>{title}</h2>
      <button type="button" class="x" aria-label="Close" onclick={close}>✕</button>
    </div>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    overflow-y: auto;
    padding: 38px 16px;
    box-sizing: border-box;
    background: rgba(47, 52, 55, 0.28);
  }
  .dialog {
    box-sizing: border-box;
    width: min(560px, 100%);
    padding: 16px 18px;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0;
    font-size: 1.12em;
  }
  .x {
    border: 0;
    background: none;
    color: #aaa;
    font: inherit;
    font-size: 1.3em;
    cursor: pointer;
  }
</style>
