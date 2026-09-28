const FOCUSABLE_INSIDE = '[role="slider"], input, select, button, textarea'

function isFocusable(el: HTMLElement): boolean {
  if (el.matches('input, select, textarea, button, a[href], [role="slider"]')) return true
  const tabIndex = el.getAttribute('tabindex')
  return tabIndex !== null && Number(tabIndex) >= 0
}

/** The field's wrapper: the nearest ancestor that also holds its label. */
function fieldWrapper(el: HTMLElement, body: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el
  while (node && node !== body) {
    if (node !== el && node.querySelector('label')) return node
    node = node.parentElement
  }
  return el
}

const flashTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

/**
 * Focuses a field inside the edit panel body after a deep link:
 *
 * 1. resolves `#fieldId` within `body`;
 * 2. opens any ancestor `<details>`;
 * 3. focuses it, or the first slider thumb / input / select / button inside
 *    it (`WizardSliderField` puts the id on the Radix Slider root);
 * 4. scrolls it to about a third of the panel height by setting the scroll
 *    container's `scrollTop` — never `scrollIntoView`, which would also scroll
 *    the window;
 * 5. flashes the field's wrapper (`data-flash`) for 1.2 s.
 *
 * Returns false when the field does not exist (e.g. glide-path sliders while
 * the glide path is off); the caller then focuses the panel title.
 */
export function focusField(fieldId: string, body: HTMLElement): boolean {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(fieldId) : fieldId
  const el = body.querySelector<HTMLElement>(`#${escaped}`)
  if (!el) return false

  for (let node = el.parentElement; node && node !== body; node = node.parentElement) {
    if (node instanceof HTMLDetailsElement && !node.open) node.open = true
  }

  const target = isFocusable(el) ? el : (el.querySelector<HTMLElement>(FOCUSABLE_INSIDE) ?? el)
  target.focus({ preventScroll: true })

  const scroller = body
  const offset =
    el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  scroller.scrollTop = Math.max(0, offset - scroller.clientHeight / 3)

  const wrapper = fieldWrapper(el, body)
  const previous = flashTimers.get(wrapper)
  if (previous) clearTimeout(previous)
  wrapper.setAttribute('data-flash', 'true')
  flashTimers.set(
    wrapper,
    setTimeout(() => {
      wrapper.removeAttribute('data-flash')
      flashTimers.delete(wrapper)
    }, 1200)
  )
  return true
}
