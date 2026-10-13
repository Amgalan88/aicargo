'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingCart, X } from 'lucide-react'

// Шинэ линк захиалга ирмэгц админы баруун дээд буланд гарах жижиг "live" мэдэгдэл.
// 20 секунд тутам шалгана (таб нуугдсан үед шалгахгүй); хаах хүртэл эсвэл "Харах" дарах хүртэл үлдэнэ.

const POLL_MS = 20_000

interface NewItem { id: number; name: string; phone: string; quantity: number }

export default function LinkOrderAlert() {
  const pathname = usePathname()
  const lastId = useRef<number | null>(null)
  const [items, setItems] = useState<NewItem[]>([])

  useEffect(() => {
    let stop = false
    async function poll() {
      if (stop || document.hidden) return
      try {
        const init = lastId.current === null
        const res = await fetch(init ? '/api/admin/link-orders/latest?init=1' : `/api/admin/link-orders/latest?after=${lastId.current}`)
        if (!res.ok) return
        const d: { latestId: number; items: NewItem[] } = await res.json()
        lastId.current = d.latestId
        if (!init && d.items.length) {
          setItems(prev => [...d.items, ...prev].slice(0, 50))
          // Цэсний тоо болон самбарын жагсаалтыг шинэчилнэ
          window.dispatchEvent(new Event('admin-counts-refresh'))
          window.dispatchEvent(new Event('link-orders-new'))
        }
      } catch {}
    }
    poll()
    const t = setInterval(poll, POLL_MS)
    const onVisible = () => { if (!document.hidden) poll() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  if (!items.length) return null
  const people = new Set(items.map(i => i.phone)).size
  const pieces = items.length
  const first = items[0]
  const close = () => setItems([])

  return (
    <div className="loa" role="status" aria-live="polite">
      <span className="loa-ic"><ShoppingCart size={18} strokeWidth={2.2} /><i aria-hidden /></span>
      <div className="loa-body">
        <b>Шинэ линк захиалга</b>
        <span>{people > 1 ? `${people} хүнээс ${pieces} линк` : `${first.name} · ${pieces} линк`}</span>
      </div>
      {!pathname.startsWith('/admin/link-orders') && (
        <Link href="/admin/link-orders" className="loa-go" onClick={close}>Харах</Link>
      )}
      <button type="button" className="loa-x" aria-label="Хаах" onClick={close}><X size={16} /></button>
    </div>
  )
}
