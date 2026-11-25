'use client'
// Тохиргоо → «Миний каргонууд»: эзэмшигч өөр карго нээнэ (нэг дугаар, нэг нууц үгээр бүгдийг удирдана).
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { cargoHostUrl } from '@/lib/cargo-url'

type Owned = { id: number; name: string; slug: string; home: boolean }
type Info = { cargos: Owned[]; currentId: number; max: number; pricePerMonth: number }

const tg = (n: number) => '₮' + n.toLocaleString('en-US')

export default function MyCargos() {
  const [info, setInfo] = useState<Info | null>(null)
  const [host, setHost] = useState('')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugMsg, setSlugMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [copy, setCopy] = useState(true)
  const [password, setPassword] = useState('')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ name: string; slug: string } | null>(null)

  const load = () => fetch('/api/admin/cargos').then(r => (r.ok ? r.json() : null)).then(setInfo).catch(() => setInfo(null))
  useEffect(() => { setHost(window.location.host); load() }, [])

  // Хаяг сул эсэхийг бичих зуур шалгана
  useEffect(() => {
    const s = slug.trim().toLowerCase()
    if (!s) { setSlugMsg(null); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/signup-cargo/check-slug?slug=${encodeURIComponent(s)}`).then(x => x.json()).catch(() => null)
      if (r) setSlugMsg(r.available ? { ok: true, text: 'Сул байна' } : { ok: false, text: r.error })
    }, 350)
    return () => clearTimeout(t)
  }, [slug])

  if (!info) return <p className="st-muted">Ачаалж байна…</p>
  const full = info.cargos.length >= info.max

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const res = await fetch('/api/admin/cargos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug: slug.trim().toLowerCase(), copySettings: copy, password }),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({}))
    setBusy(false)
    if (!res?.ok) { setError(data?.error || 'Алдаа гарлаа. Дахин оролдоно уу.'); return }
    setCreated(data.cargo)
    setOpen(false); setName(''); setSlug(''); setPassword(''); setAgree(false)
    toast.success('Шинэ карго нээгдлээ')
    load()
  }

  return (
    <div className="mc">
      <ul className="mc-list">
        {info.cargos.map(c => (
          <li key={c.id}>
            <span><b>{c.name}</b> <small>{c.slug}.aicargo.mn{c.home ? ' · үндсэн' : ''}</small></span>
            {c.id === info.currentId ? <em>Одоо энд байна</em> : host && <a className="btn-ghost btn-sm" href={cargoHostUrl(c.slug, host)}>Нээх</a>}
          </li>
        ))}
      </ul>

      {created && host && (
        <div className="mc-done">
          <b>«{created.name}» нээгдлээ.</b> Шинэ каргондоо одоогийн дугаар, нууц үгээрээ нэвтэрч, «Тохиргоо → Ажилтан»-аас хариуцах ажилтнаа нэмнэ үү.
          <a className="btn btn-sm" href={cargoHostUrl(created.slug, host, '/login')}>Шинэ карго руу орох</a>
        </div>
      )}

      {!open ? (
        <button type="button" className="btn-ghost btn-sm" onClick={() => { setOpen(true); setCreated(null) }} disabled={full}>
          + Шинэ карго нээх
        </button>
      ) : (
        <form className="mc-form" onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="mc-name">Каргоны нэр</label>
            <input id="mc-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="жш: Шинэ Эрээн карго" maxLength={60} required />
          </div>
          <div className="form-group">
            <label htmlFor="mc-slug">Хаяг</label>
            <div className="mc-slug">
              <input id="mc-slug" className="input" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="shinecargo" maxLength={30} required />
              <span>.aicargo.mn</span>
            </div>
            {slugMsg && <small className={slugMsg.ok ? 'mc-ok' : 'mc-bad'}>{slugMsg.text}</small>}
          </div>
          <label className="mc-check">
            <input type="checkbox" checked={copy} onChange={e => setCopy(e.target.checked)} />
            Одоогийн каргоны тохиргоог хуулах (тариф, үнэ бодогч, Эрээний хаяг, данс, холбоо барих, FAQ)
          </label>
          <div className="form-group">
            <label htmlFor="mc-pass">Нууц үгээ оруулж баталгаажуулна уу</label>
            <input id="mc-pass" className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <label className="mc-check">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
            Шинэ карго үнэгүй хугацаагүй, нээсэн өдрөөсөө вэбсайтын төлбөртэй ({tg(info.pricePerMonth)} / сар) гэдгийг ойлгосон
          </label>
          {error && <p className="mc-bad">{error}</p>}
          <div className="mc-actions">
            <button type="submit" className="btn btn-sm" disabled={busy || !agree || !slugMsg?.ok || name.trim().length < 2 || !password}>{busy ? 'Нээж байна…' : 'Карго нээх'}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setOpen(false); setError('') }}>Болих</button>
          </div>
        </form>
      )}
      <p className="st-muted">Нэг хүн {info.max} хүртэл карго эзэмшинэ{full ? ' — дээд хэмжээндээ хүрсэн' : ''}. Карго бүр өөрийн хаягтай, вэбсайтын төлбөр тус тусдаа.</p>
    </div>
  )
}
