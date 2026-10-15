'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { renewedUntil, formatBillingDate, PRICE_PER_PERIOD } from '@/lib/billing'

// Byl-ээр (QPay, SocialPay, карт…) онлайн төлөх: сарын тоо сонгоод төлбөрийн хуудас руу шилжинэ.
// Буцаж ирэхэд (эсвэл таб руу эргэж ороход) төлбөр орсон эсэхийг шалгаж, орсон бол хуудсыг сэргээнэ.

const OPTIONS = [1, 3, 6, 12]

interface Payment { id: number; periods: number; amount: string; status: string; createdAt: string; paidAt: string | null; paidUntilAfter: string | null; createdByName: string | null }

export function useBillingPayments() {
  const router = useRouter()
  const [online, setOnline] = useState<boolean | null>(null)
  const [items, setItems] = useState<Payment[]>([])
  const check = useCallback(async () => {
    const d = await fetch('/api/admin/billing/payments?check=1').then(r => (r.ok ? r.json() : null)).catch(() => null)
    if (!d) return
    setOnline(!!d.online)
    setItems(d.items ?? [])
    if (d.renewed) {
      toast.success('Төлбөр орлоо — хугацаа сунгагдлаа')
      router.refresh()
    }
  }, [router])
  useEffect(() => {
    check()
    const onVisible = () => { if (!document.hidden) check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [check])
  return { online, items, check }
}

export default function OnlinePay({ paidUntil }: { paidUntil: string | null }) {
  const { online } = useBillingPayments()
  const [periods, setPeriods] = useState(1)
  const [busy, setBusy] = useState(false)
  if (online === false) return null
  const until = renewedUntil(paidUntil, periods)

  async function pay() {
    setBusy(true)
    const res = await fetch('/api/admin/billing/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ periods }) }).catch(() => null)
    const d = await res?.json().catch(() => ({}))
    if (!res?.ok || !d?.url) { setBusy(false); toast.error(d?.error || 'Алдаа гарлаа'); return }
    window.location.href = d.url
  }

  return (
    <div className="op">
      <div className="op-head"><CreditCard size={16} /><b>Онлайн төлөх</b><small>QPay · SocialPay · карт</small></div>
      <div className="op-opts" role="radiogroup" aria-label="Хугацаа">
        {OPTIONS.map(n => (
          <button key={n} type="button" role="radio" aria-checked={periods === n} className={`op-opt${periods === n ? ' on' : ''}`} onClick={() => setPeriods(n)}>
            <b>{n} сар</b>
            <span>{(n * PRICE_PER_PERIOD).toLocaleString('en-US')}₮</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn op-pay" disabled={busy || online === null} onClick={pay}>
        {busy ? <Loader2 size={16} className="op-spin" /> : <CheckCircle2 size={16} />}
        {(periods * PRICE_PER_PERIOD).toLocaleString('en-US')}₮ төлөх · {formatBillingDate(until)} хүртэл
      </button>
      <p className="op-note">Төлбөр ормогц хугацаа автоматаар сунгагдана.</p>
    </div>
  )
}

export function BillingHistory() {
  const { items } = useBillingPayments()
  const paid = items.filter(i => i.status === 'PAID')
  if (!paid.length) return null
  const d = (s: string) => { const x = new Date(s); return `${x.getFullYear()}.${x.getMonth() + 1}.${x.getDate()}` }
  return (
    <div className="card op-hist">
      <b>Төлбөрийн түүх</b>
      {paid.map(p => (
        <div key={p.id} className="op-hrow">
          <span>{d(p.paidAt ?? p.createdAt)}</span>
          <span>{p.periods} сар · {Math.round(Number(p.amount)).toLocaleString('en-US')}₮</span>
          <small>{p.paidUntilAfter ? `${formatBillingDate(p.paidUntilAfter)} хүртэл` : ''}</small>
        </div>
      ))}
    </div>
  )
}
