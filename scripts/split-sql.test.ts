import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { splitSql } from './split-sql'

describe('splitSql', () => {
  it('splits ordinary statements and drops comments', () => {
    const parts = splitSql(`
      -- comment with a semicolon;
      ALTER TABLE t ENABLE ROW LEVEL SECURITY;
      /* block; comment */
      REVOKE ALL ON TABLE t FROM anon;
    `)
    assert.deepEqual(parts, [
      'ALTER TABLE t ENABLE ROW LEVEL SECURITY',
      'REVOKE ALL ON TABLE t FROM anon',
    ])
  })

  it('keeps semicolons inside dollar quotes and strings', () => {
    const parts = splitSql(`
      CREATE FUNCTION rls_guard.auto_enable() RETURNS event_trigger AS $rls$
      BEGIN
        EXECUTE 'ALTER TABLE t ENABLE ROW LEVEL SECURITY;';
      END
      $rls$;
      SELECT 'a;b';
    `)
    assert.equal(parts.length, 2)
    assert.match(parts[0], /ENABLE ROW LEVEL SECURITY;/)
    assert.equal(parts[1], "SELECT 'a;b'")
  })

  it('rejects an unclosed dollar quote', () => {
    assert.throws(() => splitSql('SELECT $tag$ hello'), /Unclosed dollar quote/)
  })
})
