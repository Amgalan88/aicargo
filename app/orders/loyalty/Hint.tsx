'use client'
import { ArrowUp, Clock, ShieldCheck, Sparkles } from 'lucide-react'
import { hintText, type Hint as HintT } from '@/lib/loyalty-view'

const CLS: Record<HintT['kind'], string> = {
  verify: 'cta', redeem: 'ok shine', unlockNext: 'ok', expiring: 'warn', vipDiscount: 'ok', held: 'warn', empty: 'info',
}

export default function Hint({ hint, onVerifyPhone }: { hint: HintT; onVerifyPhone?: () => void }) {
  const text = hintText(hint)
  return (
    <div className={`lh-hint ${CLS[hint.kind]} lh-in`} style={{ ['--i' as string]: 3 }} data-testid="lh-hint">
      {hint.kind === 'verify'
        ? <button className="btn" type="button" onClick={onVerifyPhone}><ShieldCheck size={16} strokeWidth={2.3} /> {text}</button>
        : <>
            {hint.kind === 'redeem' && <Sparkles size={13} aria-hidden />}
            {hint.kind === 'unlockNext' && <ArrowUp size={13} strokeWidth={2.8} aria-hidden />}
            {(hint.kind === 'expiring' || hint.kind === 'held') && <Clock size={13} strokeWidth={2.6} aria-hidden />}
            <span>{text}</span>
          </>}
    </div>
  )
}
