const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function trapFocusWithin(container: HTMLElement, event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>) {
  if (event.key !== 'Tab') return
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')

  if (focusable.length === 0) {
    event.preventDefault()
    container.focus()
    return
  }

  const activeIndex = focusable.indexOf(container.ownerDocument.activeElement as HTMLElement)
  if (event.shiftKey && activeIndex <= 0) {
    event.preventDefault()
    focusable[focusable.length - 1].focus()
  } else if (!event.shiftKey && (activeIndex === focusable.length - 1 || activeIndex === -1)) {
    event.preventDefault()
    focusable[0].focus()
  }
}

