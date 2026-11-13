<script lang="ts">
  // The one toast at a time, drawn at the bottom of the window. Message is plain text.
  import { clearToast, toast } from '../lib/toast.svelte'
</script>

{#if toast.current}
  <div class="toast" role="status">
    <span class="msg">{toast.current.message}</span>
    {#if toast.current.actionLabel && toast.current.onAction}
      <button
        type="button"
        class="act"
        onclick={() => {
          // Clear first: the action may show a toast of its own.
          const act = toast.current?.onAction
          clearToast()
          act?.()
        }}>{toast.current.actionLabel}</button
      >
    {/if}
    <button type="button" class="act" aria-label="Dismiss" onclick={clearToast}>×</button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    display: flex;
    gap: 12px;
    align-items: center;
    max-width: min(90vw, 600px);
    padding: 8px 14px;
    border-radius: 8px;
    background: #333;
    color: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    z-index: 100;
  }
  .msg {
    overflow-wrap: anywhere;
  }
  .act {
    padding: 0 2px;
    border: none;
    background: none;
    color: #fff;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
</style>
