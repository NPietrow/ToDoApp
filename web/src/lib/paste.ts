// Every text field takes pasted text as plain text only: rich content (HTML, images) is
// ignored. Single-line fields collapse whitespace; multi-line ones keep their newlines.
import { singleLine } from './text'

/** Svelte action for an <input> or <textarea>: `use:plainPaste` or `use:plainPaste={{ multiline: true }}`. */
export function plainPaste(
  node: HTMLInputElement | HTMLTextAreaElement,
  opts: { multiline?: boolean } = {},
) {
  let multiline = !!opts.multiline

  function onPaste(ev: Event) {
    const e = ev as ClipboardEvent
    e.preventDefault()
    const raw = e.clipboardData?.getData('text/plain') ?? ''
    const text = multiline ? raw.replace(/\r\n?/g, '\n') : singleLine(raw)
    if (!text) return
    const start = node.selectionStart ?? node.value.length
    const end = node.selectionEnd ?? start
    node.value = node.value.slice(0, start) + text + node.value.slice(end)
    node.setSelectionRange(start + text.length, start + text.length)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  }

  node.addEventListener('paste', onPaste)
  return {
    update(next: { multiline?: boolean } = {}) {
      multiline = !!next.multiline
    },
    destroy() {
      node.removeEventListener('paste', onPaste)
    },
  }
}
