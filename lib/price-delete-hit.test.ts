// Mocked handover row: a price field beside Устгах, and the edit pencil beside Буцаах.
// No database. Asserts the 44px touch target does not steal those clicks.
import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const cssPath = fileURLToPath(new URL('../app/globals.css', import.meta.url))
const css = readFileSync(cssPath, 'utf8')

const chromeBin = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].find(bin => {
  const r = spawnSync(bin, ['--version'], { stdio: 'ignore' })
  return r.status === 0
})

describe('price edit and delete are not covered', () => {
  it('touch slop is the control itself, not an overflowing pseudo-element', () => {
    assert.equal(css.includes('.hit-pad::after'), false)
    assert.match(css, /\.hit-pad[\s\S]{0,240}min-width:\s*44px/)
    assert.match(css, /\.row-enter\s*\{[^}]*backwards/)
    assert.equal(/\.row-enter\s*\{[^}]*\bboth\b/.test(css), false)
  })

  it('at 390px a tap on the price field edits the price, and Устгах still receives its own tap', { skip: !chromeBin }, async () => {
    const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/globals.css"></head><body>
      <div class="card" style="overflow:hidden;max-width:360px;margin:16px">
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.55rem 0.9rem">
          <span style="font-family:monospace;flex:1">YT8853194305559</span>
          <input id="price" class="input" type="number" aria-label="Үнэ өөрчлөх" value="3000" style="width:7.2rem" />
          <button id="del" type="button" class="hit-pad" aria-label="Устгах" style="background:none;border:none;padding:0.1rem 0.2rem">✕</button>
        </div>
      </div>
      <div class="card" style="overflow:hidden;max-width:360px;margin:16px">
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.45rem 0.9rem">
          <span style="flex:1;font-family:monospace">JT1</span>
          <span>₮4,500</span>
          <button id="edit" type="button" class="hit-pad" aria-label="Засах" style="background:none;border:none;padding:0.2rem 0.35rem">✎</button>
          <button id="revert" type="button" class="hit-pad" aria-label="Буцаах" style="background:none;border:none;padding:0.2rem 0.35rem">↩</button>
        </div>
      </div>
      <div class="row-enter" id="row" style="--i:3;width:200px;height:40px"></div>
    </body></html>`

    const server = createServer((req, res) => {
      if (req.url === '/globals.css') {
        res.setHeader('content-type', 'text/css')
        res.end(css)
      } else {
        res.setHeader('content-type', 'text/html')
        res.end(page)
      }
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    const profile = mkdtempSync(join(tmpdir(), 'hit-chrome-'))
    const chrome: ChildProcess = spawn(chromeBin!, [
      '--headless=old', '--remote-debugging-port=0', '--no-sandbox', '--disable-gpu',
      `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    const wsUrl = await new Promise<string>((resolve, reject) => {
      let buf = ''
      const t = setTimeout(() => reject(new Error('chrome did not start')), 8000)
      chrome.stderr!.on('data', (d: Buffer) => {
        buf += d.toString()
        const m = buf.match(/ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+/)
        if (m) { clearTimeout(t); resolve(m[0]) }
      })
    })

    try {
      const hits = await withPage(wsUrl, port)
      assert.equal(hits.narrow, true, 'viewport should be the 390px staff phone')
      assert.equal(hits.priceRight, 'price', `price field's right side was ${hits.priceRight}`)
      assert.equal(hits.editRight, 'edit', `edit pencil's right side was ${hits.editRight}`)
      assert.equal(hits.delCenter, 'del')
      assert.equal(hits.rowTransform, 'none')
    } finally {
      chrome.kill('SIGKILL')
      server.close()
      await new Promise(r => setTimeout(r, 200))
      try { rmSync(profile, { recursive: true, force: true }) } catch { /* chrome may still hold the profile */ }
    }
  })
})

async function withPage(browserWs: string, port: number) {
  const ws = new WebSocket(browserWs)
  let seq = 0
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  function send(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
    const msgId = ++seq
    return new Promise((resolve, reject) => {
      pending.set(msgId, { resolve, reject })
      const payload: Record<string, unknown> = { id: msgId, method, params }
      if (sessionId) payload.sessionId = sessionId
      ws.send(JSON.stringify(payload))
    })
  }
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(String(ev.data))
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)!
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  })
  await new Promise(r => ws.addEventListener('open', r))
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }) as { targetId: string }
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId: string }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 1, mobile: false }, sessionId)
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }, sessionId)
  await send('Runtime.evaluate', {
    expression: 'document.readyState === "complete" ? 1 : new Promise(r => addEventListener("load", () => r(1)))',
    awaitPromise: true,
  }, sessionId)
  await send('Runtime.evaluate', { expression: 'new Promise(r => setTimeout(r, 400))', awaitPromise: true }, sessionId)
  const evaluated = await send('Runtime.evaluate', {
    expression: `(() => {
      function rightHit(id) {
        const el = document.getElementById(id)
        const b = el.getBoundingClientRect()
        const hit = document.elementFromPoint(b.right - 4, b.top + b.height / 2)
        return hit && (hit.id || hit.tagName)
      }
      function center(id) {
        const el = document.getElementById(id)
        const b = el.getBoundingClientRect()
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
        return hit && (hit.id || hit.tagName)
      }
      return {
        narrow: matchMedia('(max-width: 640px)').matches,
        priceRight: rightHit('price'),
        editRight: rightHit('edit'),
        delCenter: center('del'),
        rowTransform: getComputedStyle(document.getElementById('row')).transform,
      }
    })()`,
    returnByValue: true,
  }, sessionId) as { result: { value: { narrow: boolean; priceRight: string; editRight: string; delCenter: string; rowTransform: string } } }
  ws.close()
  return evaluated.result.value
}
