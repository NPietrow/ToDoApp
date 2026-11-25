<script lang="ts">
  // One project's notes: a plain textarea that grows with its text and never scrolls inside
  // itself. Saves 400 ms after the last keystroke and on blur. A refresh doesn't overwrite what
  // is being typed (focus, or a save still waiting or in flight). Read-only while the server
  // reports its file as unreadable, so the file is never overwritten (see File problems), and
  // while picking for today. A save still waiting goes ahead either way.
  import { onDestroy, untrack } from 'svelte'
  import { putNotes } from '../lib/api'
  import { plainPaste } from '../lib/paste'
  import { app, refresh } from '../lib/state.svelte'
  import { continueBullet } from '../lib/text'
  import { showToast } from '../lib/toast.svelte'
  import { ui } from '../lib/ui.svelte'

  const DEBOUNCE_MS = 400

  let { projectId }: { projectId: string } = $props()

  let el: HTMLTextAreaElement | undefined = $state()
  let draft = $state(untrack(() => app.notes[projectId] ?? ''))
  let sent = untrack(() => app.notes[projectId] ?? '') // the text the server is known to hold
  let timer: ReturnType<typeof setTimeout> | undefined
  let inflight = 0

  const unreadable = $derived(app.problems.some((p) => p.file === `notes/${projectId}.txt`))

  $effect(() => {
    const incoming = app.notes[projectId] ?? ''
    untrack(() => {
      if (document.activeElement === el || timer !== undefined || inflight > 0) return
      draft = incoming
      sent = incoming
    })
  })

  /** `keepalive` lets the save outlive the page: used when the window is closing. */
  async function flush(keepalive = false) {
    clearTimeout(timer)
    timer = undefined
    if (draft === sent) return
    const text = draft
    const before = sent
    sent = text
    inflight++
    try {
      await (keepalive ? putNotes(projectId, text, { keepalive: true }) : putNotes(projectId, text))
    } catch (err) {
      sent = before
      showToast({ message: `Couldn't save notes: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      inflight--
    }
    void refresh()
  }

  function onInput() {
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), DEBOUNCE_MS)
  }

  // onDestroy doesn't run when the window closes; pagehide does.
  onDestroy(() => void flush())

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || unreadable || ui.picking) return
    const box = e.currentTarget as HTMLTextAreaElement
    if (box.selectionStart !== box.selectionEnd) return
    const next = continueBullet(box.value, box.selectionStart)
    if (!next) return
    e.preventDefault()
    draft = next.value
    box.value = next.value
    box.setSelectionRange(next.caret, next.caret)
    onInput()
  }

  /**
   * Grow to fit the content. Refits when the text or the text size changes, and (via a
   * ResizeObserver) when the box's width changes, as wrapping then changes too. Height changes
   * are ignored, so setting the height ourselves can't loop.
   */
  function grow(node: HTMLTextAreaElement, _deps: { text: string; size: string }) {
    const fit = () => {
      node.style.height = 'auto'
      node.style.height = `${node.scrollHeight}px`
    }
    let width = node.clientWidth
    const observer = new ResizeObserver(() => {
      if (node.clientWidth === width) return
      width = node.clientWidth
      fit()
    })
    observer.observe(node)
    let frame = 0
    fit()
    return {
      update() {
        fit()
        // A text size change lands in the page's font size a moment later: fit again after it.
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(fit)
      },
      destroy() {
        cancelAnimationFrame(frame)
        observer.disconnect()
      },
    }
  }
</script>

<svelte:window onpagehide={() => void flush(true)} />

<textarea aria-label="Notes" rows="1" bind:this={el} bind:value={draft} oninput={onInput}
  onkeydown={onKeydown} onblur={() => void flush()} use:grow={{ text: draft, size: app.settings.text_size }}
  use:plainPaste={{ multiline: true }} style:overflow-y="hidden"
  readonly={unreadable || ui.picking} placeholder={unreadable ? "Can't read this notes file: see file problems" : undefined}
></textarea>

<style>
  textarea {
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-height: 2.6em;
    padding: 6px 10px;
    border: 0;
    background: transparent;
    color: #555;
    font: inherit;
    resize: none;
    overflow-wrap: anywhere;
  }
  textarea:focus {
    outline: 2px solid rgba(47, 52, 55, 0.25);
    outline-offset: -2px;
  }
</style>
