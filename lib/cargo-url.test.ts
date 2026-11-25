import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cargoHostUrl } from './cargo-url'

describe('cargoHostUrl', () => {
  it('swaps the cargo subdomain on production hosts', () => {
    assert.equal(cargoHostUrl('shine', 'demo.aicargo.mn'), 'https://shine.aicargo.mn/admin')
    assert.equal(cargoHostUrl('shine', 'aicargo.mn'), 'https://shine.aicargo.mn/admin')
    assert.equal(cargoHostUrl('shine', 'www.aicargo.mn', '/login'), 'https://shine.aicargo.mn/login')
  })
  it('keeps the port and http on local hosts', () => {
    assert.equal(cargoHostUrl('demo2', 'demo.aicargo.localhost:3107'), 'http://demo2.aicargo.localhost:3107/admin')
    assert.equal(cargoHostUrl('demo2', 'aicargo.localhost:3107'), 'http://demo2.aicargo.localhost:3107/admin')
  })
})
