'use client'
import { useCallback, useEffect, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { CustomerLoyaltyView } from '@/lib/loyalty-core'
import { cardLayout, pickHint } from '@/lib/loyalty-view'
import VipRow from './VipRow'
import PointsRow from './PointsRow'
import Hint from './Hint'
import Details from './Details'
import UnlockCelebration from './UnlockCelebration'
import { useSeenLoyalty } from './useSeenLoyalty'
import { useReducedMotion } from './useReducedMotion'

// «Миний урамшуулал» (v2 compact). Горим: both / vip / points; хоёулаа унтраалттай (loyalty == null) → юу ч зурахгүй.
// Хаалттай: төлөв + 1 шатны шугам + 1 гол тоо + 1 зөвлөмж; дүрэм, шат, баримт → ⌄ дэлгэрэнгүй.
export default function LoyaltyHub({ loyalty, arrivedTotal, phone, onVerifyPhone }: {
  loyalty: CustomerLoyaltyView | null
  arrivedTotal: number
  arrivedCount?: number
  phone: string
  onVerifyPhone?: () => void
}) {
  const layout = cardLayout(loyalty)
  const [open, setOpen] = useState(false)
  const moreId = useId()
  const reduced = useReducedMotion()
  const ev = useSeenLoyalty(layout ? loyalty : null, phone)
  const [toast, setToast] = useState<number | null>(null)
  const [unlock, setUnlock] = useState<number | null>(null)
  const closeUnlock = useCallback(() => setUnlock(null), [])

  useEffect(() => {
    const timers: number[] = []
    if (ev.toastPoints > 0) {
      setToast(ev.toastPoints)
      timers.push(window.setTimeout(() => setToast(null), 3200))
    }
    // Баяр зөвхөн VIP асаалттай үед, toast-аас 650ms дараа (хөдөлгөөн багасгавал шууд)
    if (ev.unlockPct && loyalty?.vip) timers.push(window.setTimeout(() => setUnlock(ev.unlockPct), ev.toastPoints > 0 && !reduced ? 650 : 0))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev])

  if (!layout || !loyalty) return null
  const V = loyalty.vip, P = loyalty.points
  const hint = pickHint(loyalty, arrivedTotal)
  const hintEl = hint ? <Hint hint={hint} onVerifyPhone={onVerifyPhone} /> : null

  return (
    <>
      <section className="lh" aria-label="Миний урамшуулал" data-testid="loyalty-hub" data-layout={layout}>
        {layout === 'both' ? (
          <div className="lh-main both">
            <VipRow vip={V!} arrivedTotal={arrivedTotal} />
            <div className="lh-vsep" aria-hidden />
            <div className="lh-sep" aria-hidden />
            <div className="lh-col"><PointsRow points={P!} bump={!!toast} />{hintEl}</div>
          </div>
        ) : (
          <div className="lh-main">
            {V && <VipRow vip={V} arrivedTotal={arrivedTotal} />}
            {P && <PointsRow points={P} bump={!!toast} />}
            {hintEl}
          </div>
        )}
        <button className="lh-x" type="button" aria-expanded={open} aria-controls={moreId} aria-label="Дэлгэрэнгүй" onClick={() => setOpen(o => !o)}>
          <ChevronDown size={18} strokeWidth={2.4} />
        </button>
        <div className={`lh-more${open ? ' open' : ''}`} id={moreId} aria-hidden={!open} inert={!open}>
          <div><Details v={loyalty} /></div>
        </div>
      </section>
      <div className={`lh-toast${toast ? ' show' : ''}`} role="status" aria-live="polite" data-testid="lh-toast">
        {toast ? <><span className="plus">+{toast}</span> оноо нэмэгдлээ</> : null}
      </div>
      {unlock && <UnlockCelebration pct={unlock} onClose={closeUnlock} />}
    </>
  )
}
