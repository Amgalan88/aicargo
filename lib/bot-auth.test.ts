import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { bearerMatches, requestHasBotAccess } from './bot-auth'
import { parseBotOrderBody } from './bot-order'

const KEY = 'test-bot-key-not-a-real-secret'

describe('bearerMatches', () => {
  it('accepts the exact bearer token', () => {
    assert.equal(bearerMatches(`Bearer ${KEY}`, KEY), true)
  })

  it('accepts a case-insensitive scheme', () => {
    assert.equal(bearerMatches(`bearer ${KEY}`, KEY), true)
  })

  it('rejects a missing, empty, or wrong key', () => {
    assert.equal(bearerMatches(null, KEY), false)
    assert.equal(bearerMatches('', KEY), false)
    assert.equal(bearerMatches('Bearer wrong', KEY), false)
    assert.equal(bearerMatches(`Bearer ${KEY}`, undefined), false)
    assert.equal(bearerMatches(`Bearer ${KEY}`, ''), false)
    assert.equal(bearerMatches(`Bearer ${KEY.slice(0, -1)}`, KEY), false)
    assert.equal(bearerMatches(`Bearer ${KEY}x`, KEY), false)
  })

  it('rejects a non-bearer scheme and extra tokens', () => {
    assert.equal(bearerMatches(`Basic ${KEY}`, KEY), false)
    assert.equal(bearerMatches(`Bearer ${KEY} extra`, KEY), false)
    assert.equal(bearerMatches('Bearer', KEY), false)
  })

  it('does not throw when lengths differ', () => {
    assert.equal(bearerMatches('Bearer a', 'much-longer-expected-value'), false)
    assert.equal(bearerMatches(`Bearer ${'k'.repeat(300)}`, KEY), false)
  })
})

describe('requestHasBotAccess', () => {
  const prev = process.env.BOT_API_KEY
  afterEach(() => {
    if (prev === undefined) delete process.env.BOT_API_KEY
    else process.env.BOT_API_KEY = prev
  })

  it('reads BOT_API_KEY and ignores a missing or blank key', () => {
    process.env.BOT_API_KEY = `\n${KEY}  `
    assert.equal(requestHasBotAccess(`Bearer ${KEY}`), true)
    assert.equal(requestHasBotAccess(null), false)
    process.env.BOT_API_KEY = '   '
    assert.equal(requestHasBotAccess(`Bearer ${KEY}`), false)
    delete process.env.BOT_API_KEY
    assert.equal(requestHasBotAccess(`Bearer ${KEY}`), false)
  })
})

describe('parseBotOrderBody', () => {
  it('normalizes a Mongolian phone and maps note', () => {
    const parsed = parseBotOrderBody({
      trackCode: 'JT5364974054841',
      phone: '+976 9911-2233',
      name: '  Дорж  ',
      note: ' гутал ',
    })
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.deepEqual(parsed.value, {
      trackCode: 'JT5364974054841',
      phone: '99112233',
      name: 'Дорж',
      note: 'гутал',
    })
  })

  it('rejects a short phone, missing name, and a non-string note', () => {
    assert.equal(parseBotOrderBody({ trackCode: 'JT1', phone: '123', name: 'Дорж' }).ok, false)
    assert.equal(parseBotOrderBody({ trackCode: 'JT1', phone: '99112233', name: '  ' }).ok, false)
    assert.equal(parseBotOrderBody({ trackCode: 'JT1', phone: '99112233', name: 'Дорж', note: 1 }).ok, false)
    assert.equal(parseBotOrderBody(null).ok, false)
  })
})
