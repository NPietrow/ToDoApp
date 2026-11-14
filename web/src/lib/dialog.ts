// A Svelte action for modal dialogs: Escape (on the dialog itself), Tab kept inside, focus
// moved in on open and handed back to whatever had it on close.

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export interface DialogOptions {
  onEscape: () => void
  /** Where focus goes on close when the element that had it has since left the page. */
  returnFocus?: () => HTMLElement | null
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
  // The last element inside the dialog that had focus.
  let last: HTMLElement | null =
    document.activeElement instanceof HTMLElement && node.contains(document.activeElement)
      ? document.activeElement
      : null

  // A click on the backdrop or a stray focus must not leave the keyboard outside the dialog.
  function onfocusin(e: FocusEvent) {
    if (!(e.target instanceof Node)) return
    if (node.contains(e.target)) {
      if (e.target instanceof HTMLElement) last = e.target
    } else focusables()[0]?.focus()
  }

  // Focus that falls to nothing because the focused control was removed (e.g. a picker closing)
  // would leave Escape and Tab with no dialog to act on: put it back inside. Focus dropped by a
  // click on blank space inside the dialog (its control is still there) is left where it is, and
  // so is a window that has lost focus (alt-tab).
  function rescue() {
    const at = document.activeElement
    if (!node.isConnected || !document.hasFocus()) return
    if (at && at !== document.body && at !== document.documentElement) return
    if (last?.isConnected) return
    ;(node.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus()
  }
  let pending: ReturnType<typeof setTimeout> | undefined
  function onfocusout(e: FocusEvent) {
    if (e.relatedTarget !== null) return
    clearTimeout(pending)
    pending = setTimeout(rescue)
  }
  const watcher = new MutationObserver(rescue)
  watcher.observe(node, { childList: true, subtree: true })

  node.addEventListener('focusout', onfocusout)
  node.addEventListener('keydown', onkeydown)
  document.addEventListener('focusin', onfocusin)
  return {
    update(next: DialogOptions) {
      opts = next
    },
    destroy() {
      clearTimeout(pending)
      watcher.disconnect()
      node.removeEventListener('focusout', onfocusout)
      node.removeEventListener('keydown', onkeydown)
      document.removeEventListener('focusin', onfocusin)
      const target = previous?.isConnected ? previous : opts.returnFocus?.()
      target?.focus()
    },
  }
}
