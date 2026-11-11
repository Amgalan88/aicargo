'use client'
import { useEffect, useState } from 'react'
import type { VipTier } from '@/lib/loyalty-core'
import { posOf, tickPos, tg } from '@/lib/loyalty-view'

// N шат (1–5), тэнцүү хэсэг. Бөглөлт = 90 хоногийн дүн; зураастай таамаг = + ирсэн ачаа. Цэг доор зөвхөн %.
export default function TierBar({ spend, arrivedTotal, tiers, nextMinSpend, aria }: {
  spend: number; arrivedTotal: number; tiers: VipTier[]; nextMinSpend: number | null; aria: string
}) {
  const [ready, setReady] = useState(false)
  useEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true))); return () => cancelAnimationFrame(r) }, [])
  const w = posOf(spend, tiers), pw = posOf(spend + Math.max(0, arrivedTotal), tiers), n = tiers.length
  return (
    <div className="lh-bar labels lh-in" style={{ ['--i' as string]: 1 }} role="img" aria-label={aria} data-testid="lh-tierbar">
      <div className="lh-rail">
        <div className="lh-pfill" style={{ width: `${ready ? pw : 0}%` }} />
        <div className="lh-fill" style={{ width: `${ready ? w : 0}%` }} />
      </div>
      {tiers.map((t, i) => {
        const on = spend >= t.minSpend, nx = nextMinSpend === t.minSpend
        return (
          <span key={t.minSpend} className={`lh-tk${on ? ' on' : ''}${nx ? ' nx' : ''}`} style={{ left: `calc(6px + (100% - 12px) * ${tickPos(i, n) / 100})` }} title={`${tg(t.minSpend)} → ${t.pct}%`}>
            <b>{t.pct}%</b>
          </span>
        )
      })}
    </div>
  )
}
