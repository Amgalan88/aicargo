import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planStaffEdit, planTrackCodeEdit } from './track-code-edit'

const mine = { id: 7, trackCode: 'YT8853194305559', cargoId: 3 }

describe('staff track-code edit (mocked, no database)', () => {
  it('normalizes and accepts a new code in this cargo', () => {
    const r = planTrackCodeEdit({
      raw: '  jt1234567890  ',
      shipment: mine,
      callerCargoId: 3,
      existingIdInCargo: null,
    })
    assert.deepEqual(r, { ok: true, code: 'JT1234567890', changed: true })
  })

  it('rejects an empty code', () => {
    const r = planTrackCodeEdit({ raw: '   ', shipment: mine, callerCargoId: 3, existingIdInCargo: null })
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.equal(r.status, 400)
      assert.equal(r.error, 'Трак код оруулна уу')
    }
  })

  it('rejects a duplicate inside the same cargo', () => {
    const r = planTrackCodeEdit({
      raw: 'sf5141065336093',
      shipment: mine,
      callerCargoId: 3,
      existingIdInCargo: 9,
    })
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.equal(r.status, 409)
      assert.equal(r.error, 'Энэ трак код энэ каргод бүртгэлтэй байна')
    }
  })

  it('allows the same code when it already belongs to this shipment', () => {
    const r = planTrackCodeEdit({
      raw: 'yt8853194305559',
      shipment: mine,
      callerCargoId: 3,
      existingIdInCargo: mine.id,
    })
    assert.deepEqual(r, { ok: true, code: 'YT8853194305559', changed: false })
  })

  it('rejects another tenant even if that cargo has no such code', () => {
    const other = { id: 7, trackCode: 'YT8853194305559', cargoId: 8 }
    const missing = planTrackCodeEdit({ raw: 'JT1234567890', shipment: null, callerCargoId: 3, existingIdInCargo: null })
    const wrongCargo = planTrackCodeEdit({ raw: 'JT1234567890', shipment: other, callerCargoId: 3, existingIdInCargo: null })
    assert.equal(missing.ok, false)
    assert.equal(wrongCargo.ok, false)
    if (!missing.ok && !wrongCargo.ok) {
      assert.equal(missing.status, 404)
      assert.equal(wrongCargo.status, 404)
      assert.equal(missing.error, 'Ачаа олдсонгүй')
    }
  })

  it('saves price and tracking code together', () => {
    const r = planStaffEdit({
      shipment: mine, callerCargoId: 3, existingIdInCargo: null,
      trackCode: 'sf5141065336093', adminPrice: '4500',
    })
    assert.deepEqual(r, { ok: true, trackCode: 'SF5141065336093', price: 4500 })
  })

  it('saves a price without touching the tracking code', () => {
    const r = planStaffEdit({
      shipment: mine, callerCargoId: 3, existingIdInCargo: null,
      adminPrice: 1200,
    })
    assert.deepEqual(r, { ok: true, price: 1200 })
    assert.equal('trackCode' in r, false)
  })

  it('saves a tracking code without touching the price', () => {
    const r = planStaffEdit({
      shipment: mine, callerCargoId: 3, existingIdInCargo: null,
      trackCode: 'DPK365098423720',
    })
    assert.deepEqual(r, { ok: true, trackCode: 'DPK365098423720' })
    assert.equal('price' in r, false)
  })

  it('rejects a negative or non-numeric price', () => {
    for (const adminPrice of [-1, '-5', 'abc', '₮-10']) {
      const r = planStaffEdit({
        shipment: mine, callerCargoId: 3, existingIdInCargo: null,
        trackCode: mine.trackCode, adminPrice,
      })
      assert.equal(r.ok, false)
      if (!r.ok) {
        assert.equal(r.status, 400)
        assert.equal(r.error, 'Үнэ 0 буюу түүнээс их тоо байна')
      }
    }
  })

  it('keeps zero and treats a blank price as no price', () => {
    const zero = planStaffEdit({ shipment: mine, callerCargoId: 3, existingIdInCargo: null, adminPrice: '0' })
    const blank = planStaffEdit({ shipment: mine, callerCargoId: 3, existingIdInCargo: null, adminPrice: '  ' })
    assert.deepEqual(zero, { ok: true, price: 0 })
    assert.deepEqual(blank, { ok: true, price: null })
  })

  it('allows a code that exists only in another cargo', () => {
    const r = planTrackCodeEdit({
      raw: 'DPK365098423720',
      shipment: mine,
      callerCargoId: 3,
      existingIdInCargo: null,
    })
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.code, 'DPK365098423720')
  })
})
