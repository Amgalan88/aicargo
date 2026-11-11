'use client'
import type { CustomerLoyaltyView } from '@/lib/loyalty-core'
import { fmtMD, fmtYMD, nextTier, redeemFact, tg, tgK } from '@/lib/loyalty-view'

// ⌄ дэлгэрэнгүй: VIP шатны чипүүд + «Одоо», онооны 4 факт, дуусах огноо, сүүлийн 3 олголт
export default function Details({ v }: { v: CustomerLoyaltyView }) {
  const V = v.vip, P = v.points
  const nx = V ? nextTier(V) : null
  const fact = P ? redeemFact(P.maxRedeemPct) : null
  return (
    <div className="lh-det">
      {V && (
        <div>
          <h4>VIP шат · {V.windowDays} хоног</h4>
          <div className="lh-tiers">
            {V.tiers.map(t => (
              <span key={t.minSpend} className={`lh-tier${V.pct === t.pct ? ' on' : ''}${nx && nx.minSpend === t.minSpend ? ' nx' : ''}`}>{tgK(t.minSpend)} → {t.pct}%</span>
            ))}
          </div>
          <p className="lh-note" style={{ marginTop: '.35rem' }}>
            Одоо: {tg(V.spend)}
            {V.source === 'MANUAL' ? ` · онцгой ${V.pct}%${V.manualUntil ? `, ${fmtYMD(V.manualUntil)} хүртэл` : ''}` : ''}
            {V.held ? ` · ${V.graceDays} хоног хадгална` : ''}
          </p>
        </div>
      )}
      {P && (
        <div>
          <h4>Оноо</h4>
          <div className="lh-facts">
            <span>{tg(P.earnMntPerPoint)} = 1 оноо</span>
            <span>1 оноо = {tg(P.pointValueMnt)}</span>
            {fact && <span data-testid="lh-redeem-fact">{fact}</span>}
            <span>{P.expiryDays} хоног</span>
          </div>
          {P.expiringSoon && P.expiringSoon.points > 0 && <p className="lh-note" style={{ marginTop: '.35rem' }}>{P.expiringSoon.points} оноо {fmtYMD(P.expiringSoon.at)}-нд дуусна</p>}
          {!P.canRedeem && <p className="lh-note" style={{ marginTop: '.2rem' }}>Ашиглахад утсаа баталгаажуулна</p>}
        </div>
      )}
      {v.receipts.length > 0 && (
        <div>
          <h4>Сүүлийн олголт</h4>
          {v.receipts.slice(0, 3).map(r => (
            <div key={r.id} className="lh-rc">
              <span>{fmtMD(r.createdAt)} · {r.itemCount} ачаа</span>
              <span><b className="num">{tg(r.netMnt)}</b>{P && r.pointsEarned > 0 ? <> <span className="lh-plus">+{r.pointsEarned}</span></> : null}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
