import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reduceComboKey, selectedOption, shouldShowSuggestions, type ComboKeyState } from './combobox-keys'

const people = [
  { id: '1', name: 'Болд', phone: '99110001', branch: 'Кино үйлдвэр' },
  { id: '2', name: 'Сараа', phone: '88110002', branch: 'Кино үйлдвэр' },
  { id: '3', name: 'Дорж', phone: '77110003', branch: 'Баянзүрх' },
] as const

const closed = (count: number = people.length): ComboKeyState => ({ open: false, active: -1, count })

describe('combobox keyboard', () => {
  it('ArrowDown opens the list and highlights the first mocked option', () => {
    const r = reduceComboKey(closed(), 'ArrowDown')
    assert.equal(r.prevent, true)
    assert.deepEqual(r.state, { open: true, active: 0, count: 3 })
    assert.equal(r.action.type, 'move')
    assert.equal(people[r.state.active].phone, '99110001')
  })

  it('ArrowDown and ArrowUp move through options and stop at the ends', () => {
    let state = reduceComboKey(closed(), 'ArrowDown').state
    state = reduceComboKey(state, 'ArrowDown').state
    assert.equal(state.active, 1)
    assert.equal(people[state.active].name, 'Сараа')
    state = reduceComboKey(state, 'ArrowDown').state
    state = reduceComboKey(state, 'ArrowDown').state
    assert.equal(state.active, 2)
    state = reduceComboKey(state, 'ArrowUp').state
    assert.equal(state.active, 1)
    state = reduceComboKey({ open: true, active: 0, count: 3 }, 'ArrowUp').state
    assert.equal(state.active, 0)
  })

  it('ArrowUp from a closed list highlights the last option', () => {
    const r = reduceComboKey(closed(), 'ArrowUp')
    assert.equal(r.state.open, true)
    assert.equal(r.state.active, 2)
    assert.equal(people[r.state.active].branch, 'Баянзүрх')
  })

  it('Home and End move inside an open list and leave the caret alone when closed', () => {
    const open = reduceComboKey(closed(), 'ArrowDown').state
    const end = reduceComboKey({ ...open, active: 1 }, 'End')
    assert.equal(end.prevent, true)
    assert.equal(end.state.active, 2)
    const home = reduceComboKey(end.state, 'Home')
    assert.equal(home.state.active, 0)
    const closedHome = reduceComboKey(closed(), 'Home')
    assert.equal(closedHome.prevent, false)
    assert.equal(closedHome.state.open, false)
    const closedEnd = reduceComboKey(closed(), 'End')
    assert.equal(closedEnd.prevent, false)
  })

  it('Enter selects the active mocked customer and Escape closes without selecting', () => {
    let state = reduceComboKey(closed(), 'ArrowDown').state
    state = reduceComboKey(state, 'ArrowDown').state
    const picked = reduceComboKey(state, 'Enter')
    assert.equal(picked.prevent, true)
    assert.equal(picked.state.open, false)
    assert.deepEqual(selectedOption(people, picked.action), people[1])

    const esc = reduceComboKey(state, 'Escape')
    assert.equal(esc.action.type, 'close')
    assert.equal(esc.state.open, false)
    assert.equal(selectedOption(people, esc.action), null)
    assert.equal(esc.prevent, true)
  })

  it('Enter with nothing highlighted commits the typed query', () => {
    const r = reduceComboKey(closed(), 'Enter')
    assert.equal(r.action.type, 'commit')
    assert.equal(r.prevent, false)
    const openNone = reduceComboKey({ open: true, active: -1, count: 3 }, 'Enter')
    assert.equal(openNone.action.type, 'commit')
    assert.equal(openNone.state.open, false)
  })

  it('does not move while composing or with a modifier, and ignores an empty list', () => {
    const base: ComboKeyState = { open: true, active: 0, count: 3 }
    assert.equal(reduceComboKey(base, 'ArrowDown', { composing: true }).state.active, 0)
    assert.equal(reduceComboKey(closed(), 'ArrowDown', { ctrlKey: true }).state.open, false)
    assert.equal(reduceComboKey(closed(), 'ArrowDown', { metaKey: true }).prevent, false)
    assert.equal(reduceComboKey(closed(), 'ArrowDown', { altKey: true }).state.open, false)
    const empty = reduceComboKey(closed(0), 'ArrowDown')
    assert.equal(empty.state.open, false)
    assert.equal(empty.prevent, false)
  })

  it('does not reopen suggestions over a price field or delete button after Enter', () => {
    assert.equal(shouldShowSuggestions({ focused: true, suppressed: true, count: 2 }), false)
    assert.equal(shouldShowSuggestions({ focused: false, suppressed: false, count: 2 }), false)
    assert.equal(shouldShowSuggestions({ focused: true, suppressed: false, count: 0 }), false)
    assert.equal(shouldShowSuggestions({ focused: true, suppressed: false, count: 2 }), true)
  })

  it('Tab closes an open list without taking the key', () => {
    const r = reduceComboKey({ open: true, active: 1, count: 3 }, 'Tab')
    assert.equal(r.action.type, 'close')
    assert.equal(r.prevent, false)
    assert.equal(r.state.open, false)
  })
})
