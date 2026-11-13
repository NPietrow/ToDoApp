// A Svelte action for modal dialogs: Escape (on the dialog itself), Tab kept inside, focus
// moved in on open and handed back to whatever had it on close.

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export interface DialogOptions {
  onEscape: () => void
}

export function dialogFocus(node: HTMLElement, options: DialogOptions) {
  let opts = options
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const focusables = () => [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]

  // Mark the field to start in with data-autofocus; otherwise the first control gets focus.
  const first = node.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0]
  first?.focus()

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      opts.onEscape()
    } else if (e.key === 'Tab') {
      const items = focusables()
      if (items.length === 0) return
      const at = items.indexOf(document.activeElement as HTMLElement)
      const wrapTo = e.shiftKey && at <= 0 ? items.length - 1 : !e.shiftKey && at === items.length - 1 ? 0 : -1
      if (wrapTo >= 0) {
        e.preventDefault()
        items[wrapTo].focus()
      }
    }
  }
  // A click on the backdrop or a stray focus must not leave the keyboard outside the dialog.
  function onfocusin(e: FocusEvent) {
    if (e.target instanceof Node && !node.contains(e.target)) focusables()[0]?.focus()
  }

  node.addEventListener('keydown', onkeydown)
  document.addEventListener('focusin', onfocusin)
  return {
    update(next: DialogOptions) {
      opts = next
    },
    destroy() {
      node.removeEventListener('keydown', onkeydown)
      document.removeEventListener('focusin', onfocusin)
      if (previous?.isConnected) previous.focus()
    },
  }
}
