'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Link2, Plus, Trash2, Copy, Check, ExternalLink, Send, ImagePlus, X } from 'lucide-react'
import { resizeImage } from '@/lib/image-resize'
import { LINK_STATUS, MAX_ITEMS_PER_REQUEST, linkHost, money, type LinkStatus } from '@/lib/link-orders'

interface Item {
  id: number; url: string; quantity: number; note: string | null; imageUrl: string | null; status: LinkStatus
  price: string | null; paidAmount: string | null; paidAt: string | null; quotedAt: string | null
  orderedAt: string | null; trackCode: string | null; adminNote: string | null; createdAt: string
}
interface Row { url: string; quantity: string; note: string; image: string | null }

const STEPS = ['Линкээ илгээнэ', 'Барааны үнэ ирнэ', 'Төлбөрөө төлнө', 'Трак код ирнэ']
const EMPTY: Row = { url: '', quantity: '1', note: '', image: null }

const UB = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar', month: 'numeric', day: 'numeric' })
const md = (iso: string) => { const p = Object.fromEntries(UB.formatToParts(new Date(iso)).map(x => [x.type, x.value])); return `${Number(p.month)}/${Number(p.day)}` }

function CopyLine({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false)
  if (!value) return null
  return (
    <div className="lk-copy">
      <span>{label}</span>
      <b>{value}</b>
      <button type="button" aria-label={`${label} хуулах`} onClick={() => {
        navigator.clipboard.writeText(value).then(() => { setOk(true); setTimeout(() => setOk(false), 1500) }).catch(() => {})
      }}>{ok ? <Check size={14} /> : <Copy size={14} />}</button>
    </div>
  )
}

export default function LinksClient({ phone, initialOn, bank }: {
  phone: string
  initialOn: boolean
  bank: { name: string; holder: string; account: string; note: string }
}) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY }])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  // Хэрэглэгч өөрөө асаагаагүй бол маягтын оронд "Асаах" карт гарна (өмнөх захиалга, төлбөр харагдсаар)
  const [on, setOn] = useState(initialOn)
  const [turningOn, setTurningOn] = useState(false)
  async function turnOn() {
    setTurningOn(true)
    const res = await fetch('/api/link-orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: true }) }).catch(() => null)
    setTurningOn(false)
    if (!res?.ok) { toast.error('Алдаа гарлаа'); return }
    setOn(true)
    toast.success('Линк захиалга асаалаа — дээд цэсэнд гарч ирлээ')
  }

  const load = useCallback(async () => {
    const res = await fetch('/api/link-orders')
    if (res.ok) setItems(await res.json())
  }, [])
  useEffect(() => { load() }, [load])

  const set = (i: number, k: keyof Row, v: string | null) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  // Сонголтын зураг — утасны том зургийг хөтөч дээр багасгана
  async function pickImage(i: number, file: File | undefined) {
    if (!file) return
    try { set(i, 'image', await resizeImage(file, 1000)) } catch { toast.error('Зураг уншигдсангүй') }
  }
  const filled = rows.filter(r => r.url.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!filled.length || sending) return
    const body = JSON.stringify({ items: filled.map(r => ({ url: r.url, quantity: Number(r.quantity) || 1, note: r.note, image: r.image })) })
    // Vercel-ийн body хязгаар 4.5MB — олон зурагтай бол хэд хуваагаад илгээнэ
    if (body.length > 4_000_000) { setError('Зураг хэт олон байна. Хэдэн удаа хувааж илгээнэ үү'); return }
    setSending(true); setError('')
    const res = await fetch('/api/link-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    const d = await res.json().catch(() => ({}))
    setSending(false)
    if (!res.ok) { setError(d.error || 'Алдаа гарлаа'); return }
    toast.success(`${d.count} линк илгээгдлээ. Барааны үнийг тооцоод мэдэгдэнэ.`)
    setRows([{ ...EMPTY }])
    load()
  }

  async function cancel(id: number) {
    const res = await fetch('/api/link-orders', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (res.ok) { toast.success('Цуцлагдлаа'); load() } else toast.error('Цуцлах боломжгүй')
  }

  const toPay = (items ?? []).filter(i => i.status === 'QUOTED')
  const toPayTotal = toPay.reduce((s, i) => s + Number(i.price ?? 0), 0)
  const active = (items ?? []).filter(i => i.status !== 'CANCELLED')
  const cancelled = (items ?? []).filter(i => i.status === 'CANCELLED')

  return (
    <div className="page lk-page">
      <h1 className="section-title" style={{ marginBottom: '0.3rem' }}>Линкээр захиалах</h1>
      <p className="lk-sub">Taobao, Pinduoduo, 1688 зэрэг сайтын барааны линкээ илгээгээрэй. Карго барааны үнийг тооцоод танд мэдэгдэнэ.
        Тээврийн (карго) төлбөр ачаа ирэхэд <b>тарифын дагуу</b> тусад нь бодогдоно.</p>

      <ol className="lk-steps">
        {STEPS.map((s, i) => <li key={s}><b>{i + 1}</b>{s}</li>)}
      </ol>

      {/* Төлөх ёстой захиалга — хамгийн чухал мэдээлэл тул дээр */}
      {toPay.length > 0 && (
        <div className="card lk-pay">
          <div className="lk-pay-head">
            <span>Төлөх дүн · {toPay.length} бараа</span>
            <b>{money(toPayTotal)}</b>
          </div>
          <div className="lk-bank">
            <CopyLine label="Банк" value={bank.name} />
            <CopyLine label="Данс" value={bank.account} />
            <CopyLine label="Хүлээн авагч" value={bank.holder} />
            <CopyLine label="Гүйлгээний утга" value={phone} />
          </div>
          <p className="lk-hint">{bank.note || 'Гүйлгээний утгад утасны дугаараа бичнэ үү. Төлбөр орсныг карго баталгаажуулмагц захиалж өгнө.'} Энэ нь барааны үнэ — карго төлбөр ачаа ирэхэд тарифаар бодогдоно.</p>
        </div>
      )}

      {!on ? (
        <div className="card lk-off">
          <div>
            <b>Линк захиалга унтраалттай байна</b>
            <p>Асаавал дээд цэсэнд "Захиалах" гарч ирнэ. Тохиргоо цэснээс хүссэн үедээ унтрааж болно.</p>
          </div>
          <button type="button" className="btn" disabled={turningOn} onClick={turnOn}>{turningOn ? 'Асааж байна…' : 'Асаах'}</button>
        </div>
      ) : (
      <form className="card lk-form" onSubmit={submit}>
        <h2>Шинэ захиалга</h2>
        {rows.map((r, i) => (
          <div key={i} className="lk-row">
            <div className="lk-row-head">
              <span>Бараа {i + 1}</span>
              {rows.length > 1 && (
                <button type="button" className="lk-icon" aria-label="Хасах" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
              )}
            </div>
            <input className="input" inputMode="url" placeholder="Барааны линк (https://…)" value={r.url} onChange={e => set(i, 'url', e.target.value)} />
            <div className="lk-row-2">
              <label><span>Тоо</span><input className="input" type="number" min={1} max={999} value={r.quantity} onChange={e => set(i, 'quantity', e.target.value)} /></label>
              <label><span>Өнгө, хэмжээ, тайлбар</span><input className="input" placeholder="жш: хар, XL" maxLength={300} value={r.note} onChange={e => set(i, 'note', e.target.value)} /></label>
            </div>
            {r.image ? (
              <div className="lk-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.image} alt="Сонголтын зураг" />
                <span>Сонголтын зураг</span>
                <button type="button" className="lk-icon" aria-label="Зураг хасах" onClick={() => set(i, 'image', null)}><X size={15} /></button>
              </div>
            ) : (
              <label className="lk-img-add">
                <input type="file" accept="image/*" hidden onChange={e => { pickImage(i, e.target.files?.[0]); e.target.value = '' }} />
                <ImagePlus size={16} />Сонгосон өнгө, хэмжээний зураг <small>(заавал биш)</small>
              </label>
            )}
          </div>
        ))}
        {rows.length < MAX_ITEMS_PER_REQUEST && (
          <button type="button" className="btn-ghost lk-add" onClick={() => setRows(rs => [...rs, { ...EMPTY }])}><Plus size={15} />Өөр бараа нэмэх</button>
        )}
        {error && <p className="msg-error">{error}</p>}
        <button className="btn lk-send" type="submit" disabled={!filled.length || sending}>
          <Send size={16} />{sending ? 'Илгээж байна…' : filled.length > 1 ? `${filled.length} линк илгээх` : 'Илгээх'}
        </button>
      </form>
      )}

      <h2 className="lk-h2">Миний захиалга</h2>
      {items === null ? <p className="lk-sub">Ачааллаж байна…</p> : active.length === 0 && cancelled.length === 0 ? (
        <p className="lk-sub">Одоогоор захиалга алга. Дээрх хэсгээс эхний линкээ илгээгээрэй.</p>
      ) : (
        <div className="lk-list">
          {[...active, ...cancelled].map(i => {
            const st = LINK_STATUS[i.status]
            return (
              <div key={i.id} className={`card lk-item${i.status === 'CANCELLED' ? ' off' : ''}`}>
                <div className="lk-item-top">
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className="lk-link">
                    <Link2 size={14} /><span>{linkHost(i.url)}</span><ExternalLink size={12} />
                  </a>
                  <span className={`lk-st lk-${st.tone}`}>{st.user}</span>
                </div>
                <div className="lk-meta-row">
                  <div className="lk-meta">{i.quantity} ширхэг{i.note ? ` · ${i.note}` : ''} · {md(i.createdAt)}-нд илгээсэн</div>
                  {i.imageUrl && (
                    <a href={i.imageUrl} target="_blank" rel="noopener noreferrer" className="lk-thumb" aria-label="Сонголтын зураг томоор харах">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={i.imageUrl.replace('/upload/', '/upload/c_fill,w_96,h_96,q_auto,f_auto/')} alt="" />
                    </a>
                  )}
                </div>
                {i.status === 'NEW' && (
                  <div className="lk-foot"><span>Барааны үнийг тооцоолж байна</span><button type="button" className="lk-text-btn" onClick={() => cancel(i.id)}>Цуцлах</button></div>
                )}
                {i.status === 'QUOTED' && <div className="lk-foot"><span>Төлөх</span><b className="lk-amount">{money(i.price)}</b></div>}
                {i.status === 'PAID' && <div className="lk-foot"><span>Төлсөн{i.paidAt ? ` · ${md(i.paidAt)}` : ''}</span><b>{money(i.paidAmount)}</b></div>}
                {i.status === 'ORDERED' && (
                  <div className="lk-foot">
                    <span>{i.trackCode ? <>Трак код: <b className="lk-mono">{i.trackCode}</b> · <Link href="/orders">Миний ачаа-нд</Link> харагдана</> : 'Захиалагдсан — трак код удахгүй орно'}</span>
                  </div>
                )}
                {i.adminNote && i.status !== 'NEW' && <p className="lk-note">{i.adminNote}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
