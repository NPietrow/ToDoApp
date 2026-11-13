export interface Toast {
  message: string
  actionLabel?: string
  onAction?: () => void
}

/** One toast at a time. Read `toast.current`; it is null when nothing is showing. */
export const toast: { current: Toast | null } = $state({ current: null })

let timer: ReturnType<typeof setTimeout> | undefined

export function clearToast(): void {
  clearTimeout(timer)
  timer = undefined
  toast.current = null
}

export function showToast(t: Toast, ms = 5000): void {
  clearTimeout(timer)
  toast.current = t
  timer = setTimeout(clearToast, ms)
}
