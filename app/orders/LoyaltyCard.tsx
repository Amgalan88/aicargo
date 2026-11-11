'use client'
import { useState } from 'react'
import { Award, Coins, ChevronDown } from 'lucide-react'
import { vipDiscountMnt, type CustomerLoyaltyView } from '@/lib/loyalty-core'

const tg = (n: number) => '₮' + Math.round(n).toLocaleString('en-US')
const d = (iso: string) => { const x = new Date(iso); return `${x.getFullYear()}.${x.getMonth() + 1}.${x.getDate()}` }

// Карго урамшуулал асаасан үед л харагдана (loyalty == null бол юу ч зурахгүй)
export default function LoyaltyCard({ loyalty, arrivedTotal }: { loyalty: CustomerLoyaltyView | null; arrivedTotal: number }) {
  const [open, setOpen] = useState(false)
  if (!loyalty || (!loyalty.points && !loyalty.vip)) return null
  const { points, vip, receipts } = loyalty
  const vipDiscount = vip ? vipDiscountMnt(arrivedTotal, vip.pct) : 0
  return (
    <div className="card" style={{ padding: '0.85rem 1rem', margin: '0.75rem 0', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      {vip && (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
          <Award size={18} style={{ color: vip.pct > 0 ? 'var(--accent)' : 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.85rem', lineHeight: 1.45 }}>
            {vip.pct > 0
              ? <b>VIP {vip.pct}% хөнгөлөлт{vip.source === 'MANUAL' && vip.manualUntil ? ` · ${d(vip.manualUntil)} хүртэл` : ''}</b>
              : <b>VIP хөнгөлөлт</b>}
            <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
              Сүүлийн {vip.windowDays} хоногт {tg(vip.spend)}
              {vip.next ? ` · ${tg(vip.next.remaining)} нэмбэл ${vip.next.pct}%` : ''}
              {vip.held ? ` · шат буурахаас ${vip.graceDays} хоног хадгална` : ''}
            </div>
            {vipDiscount > 0 && (
              <div style={{ fontSize: '0.78rem' }}>
                Ирсэн ачаа: <s style={{ color: 'var(--muted)' }}>{tg(arrivedTotal)}</s> → <b>{tg(arrivedTotal - vipDiscount)}</b> <span style={{ color: 'var(--muted)' }}>(олгох үед тооцогдоно)</span>
              </div>
            )}
          </div>
        </div>
      )}
      {points && (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
          <Coins size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.85rem', lineHeight: 1.45 }}>
            <b>Карго оноо: {points.balance.toLocaleString('en-US')}</b> <span style={{ color: 'var(--muted)' }}>(= {tg(points.valueMnt)})</span>
            <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
              {tg(points.earnMntPerPoint)} төлөхөд 1 оноо · 1 оноо = {tg(points.pointValueMnt)} · олголтын {points.maxRedeemPct}% хүртэл · {points.expiryDays} хоногийн хугацаатай
            </div>
            {points.expiringSoon && points.expiringSoon.points > 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--orange)' }}>{points.expiringSoon.points} оноо {d(points.expiringSoon.at)}-нд дуусна</div>
            )}
            {!points.canRedeem && (
              <div style={{ fontSize: '0.78rem', color: 'var(--orange)' }}>Оноогоо ашиглахын тулд утасны дугаараа баталгаажуулна уу</div>
            )}
          </div>
        </div>
      )}
      {receipts.length > 0 && (
        <div>
          <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--muted)', fontSize: '0.78rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
            Олголтын баримт ({receipts.length}) <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
          </button>
          {open && (
            <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {receipts.map(r => (
                <div key={r.id} style={{ fontSize: '0.78rem', borderTop: '1px solid var(--border)', paddingTop: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{d(r.createdAt)} · {r.itemCount} ачаа</span><b>{tg(r.netMnt)}</b>
                  </div>
                  <div style={{ color: 'var(--muted)' }}>
                    Нийт {tg(r.grossMnt)}
                    {r.vipDiscountMnt > 0 ? ` · VIP ${r.vipPct}% −${tg(r.vipDiscountMnt)}` : ''}
                    {r.pointsRedeemed > 0 ? ` · ${r.pointsRedeemed} оноо −${tg(r.pointsRedeemedMnt)}` : ''}
                    {r.pointsEarned > 0 ? ` · +${r.pointsEarned} оноо` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
