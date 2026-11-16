// WAI-ARIA combobox keyboard (editable, list autocomplete).
// Pure so interaction tests can drive it with mocked options and no DOM.

export interface ComboKeyState {
  open: boolean
  /** Index of the active option, or -1 when nothing is highlighted. */
  active: number
  count: number
}

export type ComboAction =
  | { type: 'none' }
  | { type: 'move' }
  | { type: 'select'; index: number }
  | { type: 'close' }
  | { type: 'commit' }

export interface ComboKeyResult {
  state: ComboKeyState
  action: ComboAction
  /** True when the key should not also move the caret or submit the form. */
  prevent: boolean
}

export interface ComboKeyMods {
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  composing?: boolean
}

const IDLE: ComboAction = { type: 'none' }

function clamp(state: ComboKeyState): ComboKeyState {
  if (state.count <= 0) return { ...state, active: -1 }
  if (state.active >= state.count) return { ...state, active: state.count - 1 }
  return state
}

export function reduceComboKey(state: ComboKeyState, key: string, mods: ComboKeyMods = {}): ComboKeyResult {
  const current = clamp(state)
  if (mods.composing || mods.altKey || mods.ctrlKey || mods.metaKey) {
    return { state: current, action: IDLE, prevent: false }
  }

  if (key === 'ArrowDown' || key === 'ArrowUp') {
    if (current.count <= 0) return { state: current, action: IDLE, prevent: false }
    const open = true
    let active = current.active
    if (!current.open) {
      active = key === 'ArrowDown' ? 0 : current.count - 1
    } else if (key === 'ArrowDown') {
      active = active < 0 ? 0 : Math.min(current.count - 1, active + 1)
    } else {
      active = active < 0 ? current.count - 1 : Math.max(0, active - 1)
    }
    return { state: { ...current, open, active }, action: { type: 'move' }, prevent: true }
  }

  if (key === 'Home' || key === 'End') {
    if (!current.open || current.count <= 0) return { state: current, action: IDLE, prevent: false }
    const active = key === 'Home' ? 0 : current.count - 1
    return { state: { ...current, active }, action: { type: 'move' }, prevent: true }
  }

  if (key === 'Escape') {
    if (!current.open) return { state: current, action: IDLE, prevent: false }
    return { state: { ...current, open: false, active: -1 }, action: { type: 'close' }, prevent: true }
  }

  if (key === 'Enter') {
    if (current.open && current.active >= 0 && current.active < current.count) {
      return {
        state: { ...current, open: false, active: -1 },
        action: { type: 'select', index: current.active },
        prevent: true,
      }
    }
    return { state: { ...current, open: false, active: -1 }, action: { type: 'commit' }, prevent: false }
  }

  if (key === 'Tab') {
    if (!current.open) return { state: current, action: IDLE, prevent: false }
    return { state: { ...current, open: false, active: -1 }, action: { type: 'close' }, prevent: false }
  }

  return { state: current, action: IDLE, prevent: false }
}

/**
 * Suggestions only while the field is focused and the user has not just committed
 * (Enter / pick). A late response must not reopen the list over the price field
 * or the delete button under the search box.
 */
export function shouldShowSuggestions(input: { focused: boolean; suppressed: boolean; count: number }): boolean {
  return input.focused && !input.suppressed && input.count > 0
}

/** The mocked (or live) option a select action points at. */
export function selectedOption<T>(options: readonly T[], action: ComboAction): T | null {
  if (action.type !== 'select') return null
  return options[action.index] ?? null
}
