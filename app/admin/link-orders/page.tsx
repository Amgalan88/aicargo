'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Link2, ExternalLink, Copy, Search, Phone } from 'lucide-react'
import { confirmAsync } from '@/app/components/ConfirmDialog'
import { LINK_STATUS, linkHost, money, type LinkStatus } from '@/lib/link-orders'

interface Item {
  id: number; userId: number | null; name: string; phone: string; url: string; quantity: number; note: string | null
  status: LinkStatus; price: string | null; paidAmount: string | null; paidAt: string | null; trackCode: string | null
  adminNote: string | null; createdAt: string
}
interface Data { enabled: boolean; items: Item[]; counts: Record<string, number>; monthPaid: number; monthPaidCount: number }

const UB = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
function when(iso: string) {
  const p = Object.fromEntries(UB.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  return `${Number(p.month)}/${Number(p.day)} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

// Самбарын хавтан — дарахад тухайн төлвөөр шүүнэ
const TILES: { key: LinkStatus; hint: string }[] = [
  { key: 'NEW', hint: 'үнэ илгээх' },
  { key: 'QUOTED', hint: 'төлбөр хүлээж буй' },
  { key: 'PAID', hint: 'захиалах' },
  { key: 'ORDERED', hint: 'захиалсан' },
]

export default function LinkOrdersPage() {
  const [data, setData] = useState<Data | null>(null)
  const [status, setStatus] = useState<LinkStatus | null>(null)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    const sp = new URLSearchParams()
    if (status) sp.set('status', status)
    if (query) sp.set('q', query)
    const res = await fetch(`/api/admin/link-orders?${sp}`)
    if (res.ok) setData(await res.json())
    else toast.error('Ачаалахад алдаа гарлаа')
  }, [status, query])
  useEffect(() => { load() }, [load])
  // Шинэ захиалга ирэхэд (баруун дээд мэдэгдэл) жагсаалтыг өөрөө шинэчилнэ
  useEffect(() => {
    window.addEventListener('link-orders-new', load)
    return () => window.removeEventListener('link-orders-new', load)
  }, [load])

  async function act(ids: number[], action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch('/api/admin/link-orders', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, action, ...extra }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(d.error || 'Алдаа гарлаа'); load(); return false }
    if (d.warning) toast.warning(d.warning)
    load()
    return true
  }

  // Хүн бүрээр бүлэглэнэ (сүүлд илгээсэн нь эхэнд)
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; phone: string; items: Item[] }>()
    for (const it of data?.items ?? []) {
      const key = it.userId ? `u${it.userId}` : `p${it.phone}`
      if (!map.has(key)) map.set(key, { key, name: it.name, phone: it.phone, items: [] })
      map.get(key)!.items.push(it)
    }
    return [...map.values()]
  }, [data])

  if (!data) return <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>

  return (
    <div className="page-wide lo-page">
      <div className="lo-head">
        <h1 className="section-title" style={{ margin: 0 }}>Линк захиалга</h1>
        <span className="lo-month">Энэ сард орсон: <b>{money(data.monthPaid)}</b> · {data.monthPaidCount} бараа</span>
      </div>

      {!data.enabled && (
        <div className="card lo-off">
          Хэрэглэгчид линкээр захиалга илгээх боломж <b>унтраалттай</b> байна. <Link href="/admin/settings">Тохиргоо</Link> хэсгээс "Линкээр захиалга авах"-ыг асаана уу.
        </div>
      )}

      <div className="lo-tiles">
        {TILES.map(t => (
          <button key={t.key} type="button" aria-pressed={status === t.key} className={`lo-tile lo-${LINK_STATUS[t.key].tone}${status === t.key ? ' on' : ''}`}
            onClick={() => setStatus(s => (s === t.key ? null : t.key))}>
            <b>{data.counts[t.key] ?? 0}</b>
            <span>{LINK_STATUS[t.key].label}</span>
            <small>{t.hint}</small>
          </button>
        ))}
      </div>

      <div className="lo-bar">
        <form className="lo-search" onSubmit={e => { e.preventDefault(); setQuery(q.trim()) }}>
          <Search size={16} />
          <input className="input" placeholder="Утас эсвэл нэрээр хайх" value={q} onChange={e => setQ(e.target.value)} />
        </form>
        <button type="button" className={`lo-chip${status === 'CANCELLED' ? ' on' : ''}`} onClick={() => setStatus(s => (s === 'CANCELLED' ? null : 'CANCELLED'))}>
          Цуцалсан {data.counts.CANCELLED ?? 0}
        </button>
        {(status || query) && <button type="button" className="lo-clear" onClick={() => { setStatus(null); setQ(''); setQuery('') }}>Шүүлт арилгах</button>}
      </div>

      {groups.length === 0 ? (
        <div className="empty"><p>{status || query ? 'Энэ шүүлтэд захиалга алга.' : 'Одоогоор линк захиалга ирээгүй байна.'}</p></div>
      ) : (
        <div className="lo-groups">
          {groups.map(g => {
            const quoted = g.items.filter(i => i.status === 'QUOTED')
            const quotedSum = quoted.reduce((s, i) => s + Number(i.price ?? 0), 0)
            return (
              <section key={g.key} className="card lo-group">
                <header className="lo-group-head">
                  <div>
                    <b>{g.name}</b>
                    <a href={`tel:${g.phone}`} className="lo-phone"><Phone size={13} />{g.phone}</a>
                  </div>
                  {quoted.length > 1 && (
                    <button type="button" className="btn lo-btn" onClick={async () => {
                      if (!await confirmAsync(`${g.name}-ийн ${quoted.length} барааны төлбөр (${money(quotedSum)}) орсон уу?`)) return
                      if (await act(quoted.map(i => i.id), 'paid')) toast.success('Төлбөр бүртгэгдлээ')
                    }}>Бүгдийн төлбөр орсон · {money(quotedSum)}</button>
                  )}
                </header>
                {g.items.map(i => <ItemRow key={i.id} it={i} act={act} />)}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ItemRow({ it, act }: { it: Item; act: (ids: number[], action: string, extra?: Record<string, unknown>) => Promise<boolean> }) {
  const st = LINK_STATUS[it.status]
  const [price, setPrice] = useState(it.price ? String(Math.round(Number(it.price))) : '')
  const [editPrice, setEditPrice] = useState(false)
  const [track, setTrack] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (action: string, extra?: Record<string, unknown>) => { setBusy(true); await act([it.id], action, extra); setBusy(false) }

  return (
    <div className={`lo-item${it.status === 'CANCELLED' ? ' off' : ''}`}>
      <div className="lo-item-main">
        <div className="lo-item-top">
          <a href={it.url} target="_blank" rel="noopener noreferrer" className="lo-link"><Link2 size={14} />{linkHost(it.url)}<ExternalLink size={12} /></a>
          <button type="button" className="lo-icon" aria-label="Линк хуулах" title="Линк хуулах" onClick={() => navigator.clipboard.writeText(it.url).then(() => toast.success('Линк хуулагдлаа')).catch(() => {})}><Copy size={13} /></button>
          <span className={`lo-st lo-${st.tone}`}>{st.label}</span>
        </div>
        <div className="lo-meta"><b>{it.quantity} ш</b>{it.note ? ` · ${it.note}` : ''} · {when(it.createdAt)}</div>
        {it.adminNote && it.status === 'CANCELLED' && <div className="lo-meta">Шалтгаан: {it.adminNote}</div>}
      </div>

      <div className="lo-actions">
        {(it.status === 'NEW' || (it.status === 'QUOTED' && editPrice)) && (
          <form className="lo-inline" onSubmit={e => { e.preventDefault(); if (Number(price) > 0) run('quote', { price: Number(price) }).then(() => setEditPrice(false)) }}>
            <input className="input" inputMode="numeric" placeholder="Нийт үнэ ₮" value={price} onChange={e => setPrice(e.target.value.replace(/\D/g, ''))} />
            <button className="btn lo-btn" disabled={busy || !(Number(price) > 0)}>{it.status === 'NEW' ? 'Үнэ илгээх' : 'Хадгалах'}</button>
          </form>
        )}
        {it.status === 'QUOTED' && !editPrice && (
          <>
            <span className="lo-amount">{money(it.price)}</span>
            <button type="button" className="btn lo-btn" disabled={busy} onClick={async () => {
              if (!await confirmAsync(`${money(it.price)} төлбөр орсон уу?`)) return
              run('paid')
            }}>Төлбөр орсон</button>
            <button type="button" className="lo-text" onClick={() => setEditPrice(true)}>Үнэ засах</button>
          </>
        )}
        {it.status === 'PAID' && (
          <form className="lo-inline" onSubmit={e => { e.preventDefault(); run('ordered', { trackCode: track }) }}>
            <span className="lo-amount lo-paid">{money(it.paidAmount)}</span>
            <input className="input" placeholder="Трак код" title="Трак код (заавал биш) — оруулбал хэрэглэгчийн ачаанд нэмэгдэнэ" value={track} onChange={e => setTrack(e.target.value)} />
            <button className="btn lo-btn" disabled={busy}>Захиалсан</button>
          </form>
        )}
        {it.status === 'ORDERED' && (
          <span className="lo-done">{money(it.paidAmount)}{it.trackCode ? <> · <b className="lo-mono">{it.trackCode}</b></> : ''}</span>
        )}
        {(it.status === 'NEW' || it.status === 'QUOTED' || it.status === 'PAID') && (
          <button type="button" className="lo-text lo-danger" disabled={busy} onClick={async () => {
            if (!await confirmAsync(it.status === 'PAID' ? 'Төлбөр орсон захиалгыг цуцлах уу? Мөнгийг хэрэглэгчид буцаана уу.' : 'Энэ захиалгыг цуцлах уу?')) return
            run('cancel')
          }}>Цуцлах</button>
        )}
        {it.status === 'CANCELLED' && <button type="button" className="lo-text" disabled={busy} onClick={() => run('reopen')}>Сэргээх</button>}
      </div>
    </div>
  )
}
