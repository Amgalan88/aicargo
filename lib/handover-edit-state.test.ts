import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { closeHandoverEdit, handoverPhoneGroupLabel, initialHandoverEdit, isRowEditing, openHandoverEdit } from './handover-edit-state'

const row = { id: 9, trackCode: 'YT8853194305559', adminPrice: 2500, arrivedAt: '2026-11-09T02:00:00.000Z' }

describe('handover edit starts closed (mocked, no database)', () => {
  it('is closed on the initial render even when the row has a code, price, and date', () => {
    const edit = initialHandoverEdit()
    assert.equal(edit, null)
    assert.equal(isRowEditing(edit, row.id), false)
    assert.equal(isRowEditing(edit, 0), false)
  })

  it('stays closed when a date group expands or collapses', () => {
    const opened = openHandoverEdit(row)
    assert.equal(isRowEditing(opened, row.id), true)
    const afterToggle = closeHandoverEdit()
    assert.equal(afterToggle, null)
    assert.equal(isRowEditing(afterToggle, row.id), false)
  })

  it('opens only the row whose Засах was pressed, and only one at a time', () => {
    const first = openHandoverEdit(row)
    const other = openHandoverEdit({ id: 10, trackCode: 'JT1', adminPrice: null })
    assert.equal(isRowEditing(first, 9), true)
    assert.equal(isRowEditing(first, 10), false)
    assert.equal(isRowEditing(other, 9), false)
    assert.equal(isRowEditing(other, 10), true)
    assert.equal(isRowEditing(closeHandoverEdit(), 10), false)
  })
})

describe('phone-less handover group label (mocked, no database)', () => {
  it('labels the dash bucket as phone-less cargo', () => {
    assert.deepEqual(handoverPhoneGroupLabel('—'), { label: 'Утасгүй ачаа', phoneLess: true })
    assert.deepEqual(handoverPhoneGroupLabel(null), { label: 'Утасгүй ачаа', phoneLess: true })
    assert.deepEqual(handoverPhoneGroupLabel('  '), { label: 'Утасгүй ачаа', phoneLess: true })
    assert.deepEqual(handoverPhoneGroupLabel('99001122'), { label: '99001122', phoneLess: false })
  })
})
