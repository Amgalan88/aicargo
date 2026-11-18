import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseArrivedCode, parseTrackCode } from './track-code'

describe('parseArrivedCode (mocked, no database)', () => {
  const kept = [
    'YT8853194305559',
    'JT5467125484093',
    'JT1234567890',
    'SF5141065336093',
    'DPK365098423720',
    'CX-2024-00123',
    '123456',
  ]

  for (const code of kept) {
    it(`accepts ${code}`, () => {
      assert.equal(parseArrivedCode(code), code)
      assert.equal(parseArrivedCode(`  ${code.toLowerCase()}  `), code)
    })
  }

  it('still cleans scanner prefixes, piece counts, and Mongolian keyboard input', () => {
    assert.equal(parseArrivedCode('BAR CODE SCAN RESULT: JT5532123456'), 'JT5532123456')
    assert.equal(parseArrivedCode('DPK365098423720*1'), 'DPK365098423720')
    assert.equal(parseArrivedCode('РЭ5532123456'), 'JT5532123456')
    assert.equal(parseTrackCode('YT8853194305559'), 'YT8853194305559')
  })

  it('accepts a 6–60 character letter/digit/hyphen token that is not a carrier code', () => {
    assert.equal(parseArrivedCode('ABCDEF'), 'ABCDEF')
    assert.equal(parseArrivedCode('ab-123'), 'AB-123')
    assert.equal(parseArrivedCode('БУДААБАРАА'), 'БУДААБАРАА')
    assert.equal(parseArrivedCode('A'.repeat(60)), 'A'.repeat(60))
  })

  it('trims and rejects short codes and codes with other characters', () => {
    assert.equal(parseArrivedCode('8888'), null)
    assert.equal(parseArrivedCode('  8888  '), null)
    assert.equal(parseArrivedCode(':88282727/₮'), null)
    assert.equal(parseArrivedCode('ABCDE'), null)
    assert.equal(parseArrivedCode(''), null)
    assert.equal(parseArrivedCode('   '), null)
    assert.equal(parseArrivedCode('АЧАА ЗАДЛАХ ТӨЛБӨР'), null)
    assert.equal(parseArrivedCode('БУДАА'), null)
    assert.equal(parseArrivedCode('ABC123!'), null)
    assert.equal(parseArrivedCode('A'.repeat(61)), null)
    assert.equal(parseArrivedCode(null), null)
  })
})
