'use client'
import { useEffect, useState } from 'react'
import type { CustomerLoyaltyView } from '@/lib/loyalty-core'
import { parseSeen, seenDiff, seenKey } from '@/lib/loyalty-view'

// localStorage['aicargo:lh:{cargoId}:{phone}'] = { pct, lastReceiptId }.
// Анх ачаалахад баярлахгүй (зөвхөн хадгална); дараа нь шинэ баримтын оноо → toast, VIP хувь өссөн → баяр. Нэг нээлтэд нэг удаа.
export function useSeenLoyalty(v: CustomerLoyaltyView | null, phone: string) {
  const [events, setEvents] = useState<{ toastPoints: number; unlockPct: number | null }>({ toastPoints: 0, unlockPct: null })
  const sig = v ? `${v.cargoId}:${phone}:${v.vip?.pct ?? '-'}:${v.receipts[0]?.id ?? 0}:${!!v.points}` : ''
  useEffect(() => {
    if (!v || !phone) return
    const key = seenKey(v.cargoId, phone)
    let raw: string | null = null
    try { raw = window.localStorage.getItem(key) } catch { return } // хувийн горим гэх мэт — баяргүй
    const d = seenDiff(parseSeen(raw), v)
    try { window.localStorage.setItem(key, JSON.stringify(d.next)) } catch { /* ignore */ }
    if (d.toastPoints > 0 || d.unlockPct) setEvents({ toastPoints: d.toastPoints, unlockPct: d.unlockPct })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  return events
}
