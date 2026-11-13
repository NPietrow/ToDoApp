<script lang="ts">
  // A right-click menu at a point, clamped inside the window. Submenus open on hover and on
  // click / Enter / ArrowRight. Arrow keys move between items; Esc, an outside click or an
  // action closes it. Labels are plain text.
  import { onMount, tick } from 'svelte'
  import type { MenuItem } from '../lib/menus'

  let { items, x, y, onclose }: { items: MenuItem[]; x: number; y: number; onclose: () => void } =
    $props()

  let root: HTMLElement | undefined = $state()
  // Indexes of the open submenus, outermost first.
  let openPath: number[] = $state([])
  let placed: { left: number; top: number } | null = $state(null)
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null

  onMount(() => {
    if (!root) return
    const r = root.getBoundingClientRect()
    placed = {
      left: Math.max(0, Math.min(x, window.innerWidth - r.width)),
      top: Math.max(0, Math.min(y, window.innerHeight - r.height)),
    }
    root.querySelector<HTMLElement>('[role=menuitem]')?.focus()
  })

  function close(restoreFocus: boolean) {
    onclose()
    if (restoreFocus && previous?.isConnected) previous.focus()
  }

  const isOpen = (path: number[]) =>
    openPath.length >= path.length && path.every((v, k) => openPath[k] === v)

  /** Keep a submenu inside the window: flip to the left, or slide up, when it would overflow. */
  function fit(node: HTMLElement) {
    if (!node.classList.contains('sub')) return
    const r = node.getBoundingClientRect()
    if (r.right > window.innerWidth) {
      node.style.left = 'auto'
      node.style.right = '100%'
    }
    if (r.bottom > window.innerHeight) node.style.top = `${window.innerHeight - r.bottom}px`
  }

  async function openSub(path: number[], focusFirst: boolean) {
    openPath = path
    if (!focusFirst) return
    await tick()
    const wrap = root?.querySelector<HTMLElement>(`[data-path="${path.join('-')}"]`)
    wrap?.querySelector<HTMLElement>(':scope > [role=menu] [role=menuitem]')?.focus()
  }

  function hover(path: number[], i: number, item: MenuItem, e: MouseEvent) {
    ;(e.currentTarget as HTMLElement).focus()
    openPath = item.submenu && !item.disabled ? [...path, i] : path
  }

  function activate(path: number[], i: number, item: MenuItem) {
    if (item.disabled) return
    if (item.submenu) {
      void openSub([...path, i], false)
      return
    }
    item.action?.()
    close(false)
  }

  function onkeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    const menu = target.closest<HTMLElement>('[role=menu]')
    if (!menu || target.getAttribute('role') !== 'menuitem') return
    const siblings = [
      ...menu.querySelectorAll<HTMLElement>(':scope > .wrap > [role=menuitem]'),
    ]
    const at = siblings.indexOf(target)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      siblings[(at + step + siblings.length) % siblings.length]?.focus()
    } else if (e.key === 'ArrowRight' && target.hasAttribute('aria-haspopup')) {
      e.preventDefault()
      const path = target.parentElement!.dataset.path!.split('-').map(Number)
      void openSub(path, true)
    } else if (e.key === 'ArrowLeft') {
      const parent = menu.parentElement?.querySelector<HTMLElement>(':scope > [role=menuitem]')
      if (parent) {
        e.preventDefault()
        openPath = openPath.slice(0, -1)
        parent.focus()
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      close(true)
    }
  }

  function onwindowkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    }
  }

  function onwindowmousedown(e: MouseEvent) {
    if (root && !root.contains(e.target as Node)) close(false)
  }
</script>

<svelte:window onkeydown={onwindowkeydown} onmousedown={onwindowmousedown} />

{#snippet list(menuItems: MenuItem[], path: number[])}
  <div class="menu" class:sub={path.length > 0} role="menu" use:fit>
    {#each menuItems as item, i (item.label)}
      {@const here = [...path, i]}
      <div class="wrap" data-path={here.join('-')}>
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          class:danger={item.danger}
          aria-disabled={item.disabled ? 'true' : undefined}
          aria-haspopup={item.submenu ? 'menu' : undefined}
          aria-expanded={item.submenu ? isOpen(here) : undefined}
          onmouseenter={(e) => hover(path, i, item, e)}
          onclick={() => activate(path, i, item)}
        >
          {#if item.swatch}<span class="sw" style:background={item.swatch}></span>{/if}{item.label}
        </button>
        {#if item.submenu && !item.disabled && isOpen(here)}
          {@render list(item.submenu, here)}
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions (keys are handled for the menu items inside) -->
<div
  class="pos"
  bind:this={root}
  style:left="{placed?.left ?? x}px"
  style:top="{placed?.top ?? y}px"
  {onkeydown}
>
  {@render list(items, [])}
</div>

<style>
  .pos {
    position: fixed;
    z-index: 50;
  }
  .menu {
    min-width: 170px;
    padding: 4px;
    border-radius: 8px;
    background: #fff;
    box-shadow:
      0 4px 18px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(0, 0, 0, 0.06);
  }
  .menu.sub {
    position: absolute;
    top: 0;
    left: 100%;
  }
  .wrap {
    position: relative;
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  button:hover,
  button:focus-visible,
  button[aria-expanded='true'] {
    background: #efece6;
    outline: none;
  }
  button[aria-disabled='true'] {
    color: #b0b0b0;
    cursor: default;
  }
  .danger {
    color: var(--blocked-fg);
  }
  .sw {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
  }
</style>
