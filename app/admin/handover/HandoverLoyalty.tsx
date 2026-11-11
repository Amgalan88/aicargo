'use client'
import { useEffect, useRef, useState } from 'react'

// «Олгох» хуудасны урамшууллын хэсэг: /api/admin/handover/quote-оор утас бүрийн VIP хөнгөлөлт, оноо, төлөх дүнг авна.
// Карго урамшуулал асаагаагүй бол юу ч харуулахгүй, товчны дүн хэвээр (одоогийн ажиллагаа).

interface GroupQuote {
  ownerKey: string
  phone: string | null
  itemCount: number
  applyLoyalty: boolean
  loyaltyNote: string | null
  redeemError: string | null
  quote: { grossMnt: number; vipPct: number; vipSource: 'AUTO' | 'MANUAL' | null; vipDiscountMnt: number; maxRedeemPoints: number; pointsRedeemed: number; pointsRedeemedMnt: number; netMnt: number; pointsEarned: number }
  customer: { name: string | null; registered: boolean; verified: boolean; canRedeem: boolean; pointsBalance: number; vipPct: number; spend: number } | null
}
interface QuoteResp { enabled: { points: boolean; vip: boolean }; pointValueMnt?: number; groups: GroupQuote[] }

const tg = (n: number) => '₮' + Math.round(n).toLocaleString('en-US')

function newKey() {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
}

export function useHandoverQuote(ids: number[]) {
  const [quote, setQuote] = useState<QuoteResp | null>(null)
  const [quotedFor, setQuotedFor] = useState('')
  const [redeem, setRedeem] = useState<Record<string, number>>({})
  const [nonce, setNonce] = useState(0)
  const keyRef = useRef<string | null>(null)
  const sig = JSON.stringify([ids, redeem])

  // Сонголт эсвэл ашиглах оноо өөрчлөгдвөл шинэ хүсэлт = шинэ requestKey
  useEffect(() => { keyRef.current = null }, [sig])

  useEffect(() => {
    if (!ids.length) { setQuote(null); setQuotedFor(sig); return }
    let alive = true
    const t = setTimeout(() => {
      fetch('/api/admin/handover/quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentIds: ids, redeem }),
      }).then(r => (r.ok ? r.json() : null)).then(d => { if (alive) { setQuote(d); setQuotedFor(sig) } }).catch(() => { if (alive) setQuotedFor(sig) })
    }, 200)
    return () => { alive = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, nonce])

  const enabled = !!(quote && (quote.enabled.points || quote.enabled.vip))
  const fresh = quotedFor === sig
  const groups = quote?.groups ?? []
  const netTotal = groups.reduce((s, g) => s + g.quote.netMnt, 0)
  return {
    quote, enabled, fresh, groups, netTotal, redeem,
    // Тооцоо (хөнгөлөлт, оноо) ирэхээс өмнө, эсвэл хуучирсан тооцоогоор олгохгүй
    blocked: !fresh,
    setRedeem: (phone: string, points: number) => setRedeem(r => {
      const n = { ...r }
      if (points > 0) n[phone] = points; else delete n[phone]
      return n
    }),
    body: () => {
      if (!keyRef.current) keyRef.current = newKey()
      return {
        shipmentIds: ids, requestKey: keyRef.current, redeem,
        ...(enabled && fresh ? { expectedNet: Object.fromEntries(groups.map(g => [g.ownerKey, g.quote.netMnt])) } : {}),
      }
    },
    // Амжилттай болсны дараа
    reset: () => { keyRef.current = null; setRedeem({}) },
    refresh: () => { setQuotedFor(''); setNonce(n => n + 1) },
  }
}

export function HandoverLoyaltyPanel({ q }: { q: ReturnType<typeof useHandoverQuote> }) {
  if (!q.enabled || !q.quote) return null
  const { quote } = q
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '0.6rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem' }}>
      {q.groups.map(g => {
        const c = g.customer
        const qq = g.quote
        return (
          <div key={g.ownerKey || 'none'} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{g.phone ?? 'Утасгүй'}</span>
              <span style={{ color: 'var(--muted)' }}>{c?.name ?? (g.phone ? 'бүртгэлгүй' : '')}{c?.registered && !c.verified ? ' · утас баталгаажаагүй' : ''}</span>
            </div>
            {!g.applyLoyalty && (
              <span style={{ color: 'var(--muted)' }}>{g.loyaltyNote === 'self' ? 'Өөрийн утсанд урамшуулал тооцохгүй' : 'Урамшуулал тооцохгүй (утасгүй)'}</span>
            )}
            {g.applyLoyalty && quote.enabled.vip && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>VIP {qq.vipPct}%{qq.vipSource === 'MANUAL' ? ' (гараар)' : qq.vipPct ? ' (90 хоног)' : ''}</span>
                <span style={{ color: qq.vipDiscountMnt ? 'var(--green)' : 'var(--muted)' }}>{qq.vipDiscountMnt ? '−' + tg(qq.vipDiscountMnt) : '—'}</span>
              </div>
            )}
            {g.applyLoyalty && quote.enabled.points && c && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                  <span>Оноо {c.pointsBalance.toLocaleString('en-US')}{quote.pointValueMnt ? ` (${tg(Math.max(0, c.pointsBalance) * quote.pointValueMnt)})` : ''}</span>
                  {c.canRedeem && qq.maxRedeemPoints > 0 ? (
                    <span style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      <input className="input" type="number" min={0} max={qq.maxRedeemPoints} step={1}
                        value={q.redeem[g.phone!] ?? ''} placeholder="0"
                        onChange={e => q.setRedeem(g.phone!, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                        style={{ width: 72, padding: '0.2rem 0.4rem', fontSize: '0.8rem' }} />
                      <button type="button" onClick={() => q.setRedeem(g.phone!, qq.maxRedeemPoints)}
                        style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 6, padding: '0.2rem 0.45rem', fontSize: '0.74rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {qq.maxRedeemPoints} хүртэл
                      </button>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--muted)', fontSize: '0.74rem' }}>{!c.canRedeem ? 'Ашиглах: бүртгэл + утас баталгаажуулалт' : 'Ашиглах оноо алга'}</span>
                  )}
                </div>
                {g.redeemError && <span style={{ color: 'var(--danger)' }}>{g.redeemError}</span>}
                {qq.pointsRedeemed > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{qq.pointsRedeemed} оноо</span><span style={{ color: 'var(--green)' }}>−{tg(qq.pointsRedeemedMnt)}</span>
                  </div>
                )}
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>Төлөх</span>
              <span style={{ color: 'var(--accent)' }}>{tg(qq.netMnt)}</span>
            </div>
            {qq.pointsEarned > 0 && <span style={{ color: 'var(--muted)' }}>Олгосны дараа +{qq.pointsEarned} оноо</span>}
          </div>
        )
      })}
    </div>
  )
}
