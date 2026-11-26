<script lang="ts">
  // A push-pin, drawn inline (no icon font or download). Filled when the task is pinned for
  // today, outlined when not. Takes the text colour; decorative, so the control around it
  // carries the label.
  let { filled }: { filled: boolean } = $props()
</script>

<svg class="pin-icon" viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
  <path
    d="M5.5 1.5h5l-.8 4.2 2.8 2.8v1h-3.5v5l-1 1-1-1v-5H3.5v-1l2.8-2.8z"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width="1.2"
    stroke-linejoin="round"
  />
</svg>

<style>
  .pin-icon {
    display: block;
    flex-shrink: 0;
  }
</style>
