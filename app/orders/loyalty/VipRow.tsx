'use client'
import { Award, Lock } from 'lucide-react'
import { fmtMD, nextTier, tg, vipKey, type LoyaltyVip } from '@/lib/loyalty-view'
import { useCountUp } from './useCountUp'
import TierBar from './TierBar'

export default function VipRow({ vip, arrivedTotal }: { vip: LoyaltyVip; arrivedTotal: number }) {
  const key = vipKey(vip)
  const nx = nextTier(vip)
  const amount = useCountUp(key.kind === 'progress' ? key.remaining : key.kind === 'held' ? key.keepMnt : 0)
  const locked = vip.pct === 0
  const badge = locked
    ? <span className="lh-badge locked"><Lock size={12} strokeWidth={2.6} /> VIP</span>
    : <span className={`lh-badge${key.kind === 'max' ? ' max' : ''}`}><Award size={13} strokeWidth={2.6} /> VIP {vip.pct}%</span>
  let k: React.ReactNode
  if (key.kind === 'max') k = 'Дээд шат'
  else if (key.kind === 'held') k = <>{vip.pct}%-аа хадгалах: <em className="num">{tg(amount)}</em></>
  else if (key.kind === 'manual') k = <>Онцгой хөнгөлөлт{key.until ? <span className="lh-m"> · {fmtMD(key.until)} хүртэл</span> : null}</>
  else k = <><em className="num">{tg(amount)}</em> дутуу <span className="lh-m">→ {key.nextPct}%</span></>
  const aria = nx ? `VIP ${nx.pct}% хүртэл ${tg(nx.remaining)} дутуу` : 'VIP дээд шат'
  return (
    <div className="lh-col" data-testid="lh-vip">
      <div className="lh-row lh-in" style={{ ['--i' as string]: 0 }}>{badge}<span className="lh-k">{k}</span></div>
      <TierBar spend={vip.spend} arrivedTotal={arrivedTotal} tiers={vip.tiers} nextMinSpend={nx?.minSpend ?? null} aria={aria} />
    </div>
  )
}
