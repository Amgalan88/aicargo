'use client'
import { useEffect, useState } from 'react'
import { HandoverReceiptSummary, type HandoverResult } from './HandoverLoyalty'

// Олголтын дараах амжилтын карт: хэнд · хэдэн ачаа · ₮ · цаг + 10 секундын «Буцаах».
// Буцаах нь «Олгосон» түүхийн буцаалттай яг адил API (PATCH /api/admin/history) — баримт цуцлагдаж, оноо/хөнгөлөлт буцна.
export interface HandoverDoneInfo { result: HandoverResult; shipmentIds: number[]; who: string; paidMnt: number; at: number }

const UNDO_SECONDS = 10

export default function HandoverDone({ info, onUndone, style }: { info: HandoverDoneInfo; onUndone: (n: number) => void; style?: React.CSSProperties }) {
  const [left, setLeft] = useState(UNDO_SECONDS)
  const [busy, setBusy] = useState(false)
  const [undone, setUndone] = useState<number | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    setLeft(UNDO_SECONDS); setUndone(null); setErr('')
    const t = setInterval(() => setLeft(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [info])

  async function undo() {
    setBusy(true); setErr('')
    const pending = [...info.shipmentIds]
    let reverted = 0
    try {
      while (pending.length) {
        const id = pending[0]
        const res = await fetch('/api/admin/history', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, wholeReceipt: true }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) { setErr(d?.error || 'Буцааж чадсангүй — «Олгосон» түүхээс буцаана уу'); break }
        const ids: number[] = Array.isArray(d?.shipmentIds) && d.shipmentIds.length ? d.shipmentIds : [id]
        reverted += ids.length
        for (const x of ids) { const i = pending.indexOf(x); if (i >= 0) pending.splice(i, 1) }
        if (!ids.includes(id)) pending.shift()
      }
    } catch { setErr('Сүлжээний алдаа — «Олгосон» түүхээс буцаана уу') }
    setBusy(false)
    if (reverted > 0) { setUndone(reverted); onUndone(reverted) }
  }

  const time = new Date(info.at).toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const n = info.result.count
  return (
    <div style={{ maxWidth: 420, marginBottom: '1.5rem', ...style }}>
      <div className="handover-done" role="status" data-testid="handover-done">
        <div style={{ minWidth: 0 }}>
          {undone === null ? (
            <>
              <div className="handover-done-title">✓ {info.who} — {n} ачаа олгогдлоо</div>
              <div className="handover-done-sub">₮{info.paidMnt.toLocaleString()} · {time}</div>
            </>
          ) : (
            <>
              <div className="handover-done-title" style={{ color: 'var(--text)' }}>↩ {undone} ачаа «Ирсэн» төлөвт буцлаа</div>
              <div className="handover-done-sub">{info.result.receipts.length ? 'Баримт цуцлагдаж, оноо/хөнгөлөлт буцаагдлаа' : info.who}</div>
            </>
          )}
          {err && <div className="msg-error" style={{ margin: '0.3rem 0 0' }}>{err}</div>}
        </div>
        {undone === null && left > 0 && (
          <button type="button" className="handover-undo" onClick={undo} disabled={busy} data-testid="handover-undo">
            {busy ? '...' : `Буцаах (${left})`}
          </button>
        )}
      </div>
      {undone === null && info.result.receipts.length > 0 && <HandoverReceiptSummary r={info.result} hideHeader style={{ maxWidth: 'none', marginBottom: 0, marginTop: '0.6rem' }} />}
    </div>
  )
}
