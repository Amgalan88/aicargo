'use client'
import { Coins, Lock } from 'lucide-react'
import { tg, type LoyaltyPoints } from '@/lib/loyalty-view'
import { useCountUp } from './useCountUp'

export default function PointsRow({ points, bump }: { points: LoyaltyPoints; bump: boolean }) {
  const bal = useCountUp(points.balance)
  const mnt = useCountUp(points.valueMnt)
  return (
    <div className="lh-row lh-in" style={{ ['--i' as string]: 2 }} data-testid="lh-points">
      <span className="lh-coin" aria-hidden><Coins size={15} strokeWidth={2.4} /></span>
      <span className="lh-k"><span className={`num${bump ? ' bump' : ''}`}>{Math.round(bal).toLocaleString('en-US')}</span> оноо</span>
      <span className="lh-m">= <span className="num">{tg(mnt)}</span></span>
      {!points.canRedeem && <span className="lh-badge locked" style={{ marginLeft: 'auto' }} title="Ашиглахад утсаа баталгаажуулна"><Lock size={12} strokeWidth={2.6} /></span>}
    </div>
  )
}
