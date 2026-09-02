'use client'
import { useState, useEffect } from 'react'

interface Tier { min: string; price: string }

export default function SettingsPage() {
  const [form, setForm] = useState({ tariff: '', priceCubic: '', priceWeight: '', priceWeightUnit: 'kg', announcement: '', contactInfo: '', bankName: '', bankAccountHolder: '', bankAccountNumber: '', bankTransferNote: '', arrivedLabel: '', ereemLabel: '', ereemReceiver: '', ereemPhone: '', ereemRegion: '', ereemAddress: '' })
  const [tiers, setTiers] = useState<Tier[]>([])
  const [cargo, setCargo] = useState<{ name: string; logoUrl?: string | null; batchEnabled?: boolean } | null>(null)
  const [me, setMe] = useState({ isStaffAdmin: false, canEditBank: false, canEditAddress: false, canEditLogo: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [logoBase64, setLogoBase64] = useState<string | null>(null)
  const [logoError, setLogoError] = useState('')
  // Ямар нэг өөрчлөлт орсон эсэхийг мэдэхийн тулд ачаалсан үеийн байдлыг хадгална
  const [baseline, setBaseline] = useState('')

  const snapshotOf = (f: typeof form, t: Tier[], logo: string | null) => JSON.stringify([f, t, !!logo])
  const dirty = baseline !== '' && snapshotOf(form, tiers, logoBase64) !== baseline

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { setLogoError('Лого 3MB-аас бага байх ёстой'); return }
    setLogoError('')
    const reader = new FileReader()
    reader.onload = ev => setLogoBase64(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => {
        setCargo(d)
        setMe({ isStaffAdmin: !!d.isStaffAdmin, canEditBank: !!d.canEditBank, canEditAddress: !!d.canEditAddress, canEditLogo: !!d.canEditLogo })
        const loadedForm = { tariff: d.tariff ?? '', priceCubic: d.priceCubic ? String(Number(d.priceCubic)) : '', priceWeight: d.priceWeight ? String(Number(d.priceWeight)) : '', priceWeightUnit: d.priceWeightUnit === 't' ? 't' : 'kg', announcement: d.announcement ?? '', contactInfo: d.contactInfo ?? '', bankName: d.bankName ?? '', bankAccountHolder: d.bankAccountHolder ?? '', bankAccountNumber: d.bankAccountNumber ?? '', bankTransferNote: d.bankTransferNote ?? '', arrivedLabel: d.arrivedLabel ?? '', ereemLabel: d.ereemLabel ?? '', ereemReceiver: d.ereemReceiver ?? '', ereemPhone: d.ereemPhone ?? '', ereemRegion: d.ereemRegion ?? '', ereemAddress: d.ereemAddress ?? '' }
        let loadedTiers: Tier[] = []
        try {
          const parsed = d.priceWeightTiers ? JSON.parse(d.priceWeightTiers) : []
          if (Array.isArray(parsed)) loadedTiers = parsed.map((t: any) => ({ min: String(t.min), price: String(t.price) }))
        } catch {}
        setForm(loadedForm)
        setTiers(loadedTiers)
        setBaseline(snapshotOf(loadedForm, loadedTiers, null))
        setLoading(false)
      })
  }, [])

  async function save() {
    if (saving || !dirty) return
    setSaving(true)
    setSaved(false)
    setSaveError('')
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          priceWeightTiers: tiers
            .map(t => ({ min: Number(t.min), price: Number(t.price) }))
            .filter(t => t.min > 0 && t.price > 0),
          ...(logoBase64 ? { logoBase64 } : {}),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setSaveError(d.error || 'Хадгалахад алдаа гарлаа. Дахин оролдоно уу.')
        return
      }
      const updated = await res.json()
      if (updated?.logoUrl) setCargo(c => c ? { ...c, logoUrl: updated.logoUrl } : c)
      setLogoBase64(null)
      setBaseline(snapshotOf(form, tiers, null))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setSaveError('Холболтын алдаа гарлаа. Дахин оролдоно уу.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>

  const allowBank = !me.isStaffAdmin || me.canEditBank
  const allowAddress = !me.isStaffAdmin || me.canEditAddress
  const allowLogo = !me.isStaffAdmin || me.canEditLogo
  const ownerOnlyNote = <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.4rem' }}>Зөвхөн эзэн админ солих боломжтой.</p>

  return (
    <>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="section-title" style={{ margin: 0 }}>Тохиргоо</h1>
        {cargo && <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.3rem' }}>{cargo.name}</p>}
      </div>

      {/* Logo */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem', opacity: allowLogo ? 1 : 0.6 }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Лого</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {(logoBase64 || cargo?.logoUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoBase64 || cargo!.logoUrl!} alt="logo" style={{
              width: 56, height: 56, borderRadius: 12, objectFit: 'cover',
              border: '1px solid var(--border)', flexShrink: 0,
            }} />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: 12, background: 'var(--surface2)',
              border: '1px dashed var(--border)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.3rem', color: 'var(--muted)',
            }}>🏷</div>
          )}
          <div style={{ minWidth: 200, flex: 1 }}>
            <input type="file" accept="image/*" onChange={handleLogo} disabled={!allowLogo} style={{ fontSize: '0.82rem' }} />
            {allowLogo ? (
              <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
                Вэб хаяг, апп-ын икон, нүүр хуудсанд харагдана. Сонгоод доорх "Хадгалах" товчийг дарна.
              </p>
            ) : ownerOnlyNote}
            {logoBase64 && <p style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '0.25rem' }}>Шинэ лого сонгогдлоо — хадгалахаа мартуузай</p>}
            {logoError && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem' }}>{logoError}</p>}
          </div>
        </div>
      </div>

      {/* Эрээний ажилтны нэвтрэлт — багц бүртгэл идэвхтэй үед, зөвхөн эзэн админд */}
      {cargo?.batchEnabled && !me.isStaffAdmin && <EreenStaffSection />}

      {/* Ажилтан admin — зөвхөн эзэн админд */}
      {!me.isStaffAdmin && <StaffAdminSection />}

      {/* Ereen address — админ өөрөө тохируулна */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem', opacity: allowAddress ? 1 : 0.6 }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>Эрээний хаяг</p>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '1rem' }}>
          Хэрэглэгчид тань Хятадаас бараа захиалахдаа энэ хаягийг ашиглана. Нүүр хуудсанд хуулах товчтой харагдана.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>收货人 (Хүлээн авагчийн нэр)</label>
            <input className="input" disabled={!allowAddress} placeholder="жш: 王明" value={form.ereemReceiver}
              onChange={e => setForm(f => ({ ...f, ereemReceiver: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>手机号 (Утас)</label>
            <input className="input" disabled={!allowAddress} placeholder="жш: 15848201234" value={form.ereemPhone}
              onChange={e => setForm(f => ({ ...f, ereemPhone: e.target.value }))} />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: '0.75rem' }}>
          <label>地区 (Бүс) <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(· тэмдгээр тусгаарлана, жш: 内蒙古 · 锡林郭勒盟 · 二连浩特市)</span></label>
          <input className="input" disabled={!allowAddress} placeholder="内蒙古 · 锡林郭勒盟 · 二连浩特市" value={form.ereemRegion}
            onChange={e => setForm(f => ({ ...f, ereemRegion: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>详细地址 (Дэлгэрэнгүй хаяг)</label>
          <input className="input" disabled={!allowAddress} placeholder="жш: XX小区 X号楼 XXX" value={form.ereemAddress}
            onChange={e => setForm(f => ({ ...f, ereemAddress: e.target.value }))} />
        </div>
        {!allowAddress && ownerOnlyNote}
      </div>

      {/* Editable fields */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>Нүүр хуудасны мэдээлэл</p>

        <div className="form-group">
          <label>"Эрээнд ирсэн" төлөвийн нэр <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(хоосон бол "Эрээнд ирсэн" гэж харагдана)</span></label>
          <input
            className="input"
            placeholder="Эрээнээс ачигдсан"
            value={form.ereemLabel}
            onChange={e => setForm(f => ({ ...f, ereemLabel: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label>"Ирсэн" төлөвийн нэр <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(хоосон бол "Ирсэн" гэж харагдана)</span></label>
          <input
            className="input"
            placeholder="Булганд ирсэн"
            value={form.arrivedLabel}
            onChange={e => setForm(f => ({ ...f, arrivedLabel: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label>Тариф <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(кг үнэ, дүрэм гэх мэт)</span></label>
          <textarea
            className="input"
            rows={5}
            placeholder={"1кг — ₮8,500\n5кг дээш — ₮8,000\nХажуугийн хэмжээ хязгаар: 1м"}
            value={form.tariff}
            onChange={e => setForm(f => ({ ...f, tariff: e.target.value }))}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>Үнэ бодогч</p>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '1rem' }}>
          Хэрэглэгч ачааныхаа хэмжээ (урт·өргөн·өндөр) болон жинг оруулж үнэ урьдчилан тооцоолно — кубын болон жингийн үнийн <strong>өндөр</strong> нь баримтлагдана. Хоёулаа хоосон бол хэрэглэгчид энэ хэсэг харагдахгүй.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Кубын үнэ <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(₮ / м³)</span></label>
            <input className="input" type="number" min="0" placeholder="жш: 350000"
              value={form.priceCubic}
              onChange={e => setForm(f => ({ ...f, priceCubic: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Жингийн үнэ</label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input className="input" type="number" min="0" placeholder={form.priceWeightUnit === 't' ? 'жш: 3500000' : 'жш: 3500'}
                value={form.priceWeight}
                onChange={e => setForm(f => ({ ...f, priceWeight: e.target.value }))}
                style={{ flex: 1, minWidth: 0 }} />
              {(['kg', 't'] as const).map(u => (
                <button key={u} type="button" onClick={() => setForm(f => ({ ...f, priceWeightUnit: u }))} style={{
                  padding: '0 0.75rem', borderRadius: 'var(--radius)', border: '1px solid',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
                  borderColor: form.priceWeightUnit === u ? 'var(--accent)' : 'var(--border)',
                  background: form.priceWeightUnit === u ? 'var(--accent)' : 'var(--surface)',
                  color: form.priceWeightUnit === u ? '#fff' : 'var(--muted)',
                }}>
                  ₮/{u === 'kg' ? 'кг' : 'тонн'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Жингийн шатлалтай үнэ */}
        {form.priceWeight && (
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>
              Шатлалтай үнэ <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(заавал биш — жш: 100 кг-аас дээш бол өөр үнээр)</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.45rem' }}>
              {tiers.map((tier, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <input className="input" type="number" min="0" placeholder="100"
                    value={tier.min}
                    onChange={e => setTiers(ts => ts.map((t, j) => j === i ? { ...t, min: e.target.value } : t))}
                    style={{ width: 100, padding: '0.45rem 0.6rem', fontSize: '0.85rem' }} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)', flexShrink: 0 }}>кг-аас дээш →</span>
                  <input className="input" type="number" min="0" placeholder={form.priceWeightUnit === 't' ? '2000000' : '2000'}
                    value={tier.price}
                    onChange={e => setTiers(ts => ts.map((t, j) => j === i ? { ...t, price: e.target.value } : t))}
                    style={{ width: 130, padding: '0.45rem 0.6rem', fontSize: '0.85rem' }} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)', flexShrink: 0 }}>₮/{form.priceWeightUnit === 't' ? 'тонн' : 'кг'}</span>
                  <button type="button" onClick={() => setTiers(ts => ts.filter((_, j) => j !== i))} style={{
                    background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer',
                    fontSize: '0.9rem', padding: '0.2rem 0.4rem', fontFamily: 'inherit',
                  }}>✕</button>
                </div>
              ))}
              <button type="button" onClick={() => setTiers(ts => [...ts, { min: '', price: '' }])} style={{
                alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--border)',
                borderRadius: 'var(--radius)', color: 'var(--muted)', cursor: 'pointer',
                fontSize: '0.78rem', padding: '0.35rem 0.8rem', fontFamily: 'inherit',
              }}>
                + Шатлал нэмэх
              </button>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.4rem' }}>
              Жин нь босго давсан тохиолдолд НИЙТ жин тухайн шатлалын үнээр бодогдоно.
            </p>
          </div>
        )}

        <div className="form-group">
          <label>Анхааруулга <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(чухал мэдэгдэл)</span></label>
          <textarea
            className="input"
            rows={3}
            placeholder="Баяр наадмын үеэр ачаа хүлээн авахгүй..."
            value={form.announcement}
            onChange={e => setForm(f => ({ ...f, announcement: e.target.value }))}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div className="form-group">
          <label>Холбоо барих <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(утас, цаг, хаяг)</span></label>
          <textarea
            className="input"
            rows={3}
            placeholder={"Утас: 99001122\nЦаг: Д-Б 09:00–18:00\nДархан, 3-р хороо"}
            value={form.contactInfo}
            onChange={e => setForm(f => ({ ...f, contactInfo: e.target.value }))}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: allowBank ? '1rem' : '0.35rem' }}>Төлбөр төлөх данс</p>
        {!allowBank && ownerOnlyNote}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem', opacity: allowBank ? 1 : 0.6, marginTop: allowBank ? 0 : '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Банкны нэр</label>
            <input className="input" disabled={!allowBank} placeholder="Хаан банк" value={form.bankName}
              onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Хүлээн авагчийн нэр</label>
            <input className="input" disabled={!allowBank} placeholder="Овог Нэр" value={form.bankAccountHolder}
              onChange={e => setForm(f => ({ ...f, bankAccountHolder: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Дансны дугаар</label>
            <input className="input" disabled={!allowBank} placeholder="5000123456" value={form.bankAccountNumber}
              onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Гүйлгээний утга <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(зааварчилгаа)</span></label>
            <input className="input" disabled={!allowBank} placeholder="Утасны дугаараа заавал бичнэ үү" value={form.bankTransferNote}
              onChange={e => setForm(f => ({ ...f, bankTransferNote: e.target.value }))} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn" onClick={save} disabled={saving || !dirty}
            style={{ opacity: saving || !dirty ? 0.5 : 1 }}>
            {saving ? 'Хадгалж байна...' : 'Хадгалах'}
          </button>
          {saved && <span style={{ fontSize: '0.82rem', color: 'var(--green)' }}>✓ Амжилттай хадгалагдлаа</span>}
          {saveError && <span style={{ fontSize: '0.82rem', color: 'var(--danger)' }}>✗ {saveError}</span>}
          {!saved && !saveError && dirty && !saving && (
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Хадгалаагүй өөрчлөлт байна</span>
          )}
        </div>
      </div>
    </>
  )
}

interface Staff { id: number; name: string; phone: string }

function EreenStaffSection() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [form, setForm] = useState({ name: '', phone: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  function load() {
    fetch('/api/admin/ereen-staff')
      .then(r => r.ok ? r.json() : [])
      .then(setStaff)
      .catch(() => {})
  }
  useEffect(() => { load() }, [])

  async function create() {
    setBusy(true); setErr(''); setMsg('')
    const res = await fetch('/api/admin/ereen-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setBusy(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(d.error || 'Алдаа гарлаа'); return }
    setMsg('✓ Нэвтрэлт үүслээ')
    setForm({ name: '', phone: '', password: '' })
    load()
    setTimeout(() => setMsg(''), 3000)
  }

  async function resetPw(id: number) {
    const pw = prompt('Шинэ нууц үг (6+ тэмдэгт):')
    if (!pw || pw.length < 6) return
    await fetch('/api/admin/ereen-staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password: pw }),
    })
    setMsg('✓ Нууц үг солигдлоо')
    setTimeout(() => setMsg(''), 3000)
  }

  async function remove(id: number) {
    if (!confirm('Энэ нэвтрэлтийг устгах уу?')) return
    await fetch('/api/admin/ereen-staff', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  return (
    <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>Эрээний ажилтны нэвтрэлт</p>
      <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        Энэ эрхээр нэвтэрсэн хүн зөвхөн багц бүртгэлийн хуудас (₮/¥ хэл солигддог) хардаг — таны бусад мэдээлэлд хандахгүй.
      </p>

      {staff.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
          {staff.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.5rem 0.75rem', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 8, gap: '0.5rem',
            }}>
              <span style={{ fontSize: '0.84rem' }}>
                <strong>{s.name}</strong>
                <span style={{ fontFamily: 'monospace', color: 'var(--muted)', marginLeft: 8 }}>{s.phone}</span>
              </span>
              <span style={{ display: 'flex', gap: '0.4rem' }}>
                <button onClick={() => resetPw(s.id)} style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                  fontSize: '0.72rem', padding: '0.2rem 0.6rem', cursor: 'pointer',
                  color: 'var(--muted)', fontFamily: 'inherit',
                }}>Нууц үг солих</button>
                <button onClick={() => remove(s.id)} style={{
                  background: 'none', border: '1px solid var(--danger)', borderRadius: 6,
                  fontSize: '0.72rem', padding: '0.2rem 0.6rem', cursor: 'pointer',
                  color: 'var(--danger)', fontFamily: 'inherit',
                }}>Устгах</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }} className="admin-form-2col">
        <div className="form-group" style={{ margin: 0 }}>
          <label>Нэр</label>
          <input className="input" placeholder="Ажилтны нэр" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Утас</label>
          <input className="input" type="tel" maxLength={8} placeholder="99001122" value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 8) }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Нууц үг</label>
          <input className="input" type="text" placeholder="6+ тэмдэгт" value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        </div>
        <button className="btn" onClick={create}
          disabled={busy || form.name.trim().length < 2 || !/^\d{8}$/.test(form.phone) || form.password.length < 6}
          style={{ padding: '0.6rem 1rem', fontSize: '0.82rem' }}>
          {busy ? '...' : '+ Үүсгэх'}
        </button>
      </div>
      {err && <p className="msg-error" style={{ marginTop: '0.6rem' }}>{err}</p>}
      {msg && <p style={{ color: 'var(--green)', fontSize: '0.82rem', marginTop: '0.6rem' }}>{msg}</p>}
    </div>
  )
}

interface StaffAdmin { id: number; name: string; phone: string; canEditBank: boolean; canEditAddress: boolean; canEditLogo: boolean }

const PERM_OPTIONS: { key: 'canEditBank' | 'canEditAddress' | 'canEditLogo'; label: string }[] = [
  { key: 'canEditBank', label: 'Дансны мэдээлэл засах' },
  { key: 'canEditAddress', label: 'Эрээний хаяг засах' },
  { key: 'canEditLogo', label: 'Лого солих' },
]

function StaffAdminSection() {
  const [staff, setStaff] = useState<StaffAdmin[]>([])
  const [form, setForm] = useState({ name: '', phone: '', password: '', canEditBank: false, canEditAddress: false, canEditLogo: false })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  function load() {
    fetch('/api/admin/staff-admin')
      .then(r => r.ok ? r.json() : [])
      .then(setStaff)
      .catch(() => {})
  }
  useEffect(() => { load() }, [])

  async function create() {
    setBusy(true); setErr(''); setMsg('')
    const res = await fetch('/api/admin/staff-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setBusy(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(d.error || 'Алдаа гарлаа'); return }
    setMsg('✓ Ажилтны admin нэвтрэлт үүслээ')
    setForm({ name: '', phone: '', password: '', canEditBank: false, canEditAddress: false, canEditLogo: false })
    load()
    setTimeout(() => setMsg(''), 3000)
  }

  async function togglePerm(s: StaffAdmin, key: 'canEditBank' | 'canEditAddress' | 'canEditLogo') {
    const next = !s[key]
    setStaff(prev => prev.map(x => x.id === s.id ? { ...x, [key]: next } : x)) // optimistic
    const res = await fetch('/api/admin/staff-admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, [key]: next }),
    })
    if (!res.ok) setStaff(prev => prev.map(x => x.id === s.id ? { ...x, [key]: s[key] } : x)) // revert on failure
  }

  async function resetPw(id: number) {
    const pw = prompt('Шинэ нууц үг (6+ тэмдэгт):')
    if (!pw || pw.length < 6) return
    await fetch('/api/admin/staff-admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password: pw }),
    })
    setMsg('✓ Нууц үг солигдлоо')
    setTimeout(() => setMsg(''), 3000)
  }

  async function remove(id: number) {
    if (!confirm('Энэ ажилтны admin нэвтрэлтийг устгах уу?')) return
    await fetch('/api/admin/staff-admin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  return (
    <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>Ажилтан admin</p>
      <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        Энэ эрхээр нэвтэрсэн хүн бусад admin-тэй адил бүртгэл/олголт/мэдэгдэл хийж чадна, гэхдээ доор тэмдэглэсэн эрхийг л
        онгойлгосон тохиолдолд Дансны мэдээлэл, Эрээний хаяг, Лого зэргийг засах боломжтой болно — та бусад ажилтан admin
        болон Эрээний ажилтны нэвтрэлт үүсгэх эрхийг зөвхөн өөрөө хадгална.
      </p>

      {staff.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {staff.map(s => (
            <div key={s.id} style={{
              padding: '0.6rem 0.75rem', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 8,
              display: 'flex', flexDirection: 'column', gap: '0.5rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.84rem' }}>
                  <strong>{s.name}</strong>
                  <span style={{ fontFamily: 'monospace', color: 'var(--muted)', marginLeft: 8 }}>{s.phone}</span>
                </span>
                <span style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => resetPw(s.id)} style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                    fontSize: '0.72rem', padding: '0.2rem 0.6rem', cursor: 'pointer',
                    color: 'var(--muted)', fontFamily: 'inherit',
                  }}>Нууц үг солих</button>
                  <button onClick={() => remove(s.id)} style={{
                    background: 'none', border: '1px solid var(--danger)', borderRadius: 6,
                    fontSize: '0.72rem', padding: '0.2rem 0.6rem', cursor: 'pointer',
                    color: 'var(--danger)', fontFamily: 'inherit',
                  }}>Устгах</button>
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
                {PERM_OPTIONS.map(p => (
                  <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    <input type="checkbox" checked={s[p.key]} onChange={() => togglePerm(s, p.key)}
                      style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'end' }} className="admin-form-2col">
        <div className="form-group" style={{ margin: 0 }}>
          <label>Нэр</label>
          <input className="input" placeholder="Ажилтны нэр" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Утас</label>
          <input className="input" type="tel" maxLength={8} placeholder="99001122" value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 8) }))} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Нууц үг</label>
          <input className="input" type="text" placeholder="6+ тэмдэгт" value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        </div>
        <button className="btn" onClick={create}
          disabled={busy || form.name.trim().length < 2 || !/^\d{8}$/.test(form.phone) || form.password.length < 6}
          style={{ padding: '0.6rem 1rem', fontSize: '0.82rem' }}>
          {busy ? '...' : '+ Үүсгэх'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
        {PERM_OPTIONS.map(p => (
          <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--muted)' }}>
            <input type="checkbox" checked={form[p.key]} onChange={e => setForm(f => ({ ...f, [p.key]: e.target.checked }))}
              style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)' }} />
            {p.label}
          </label>
        ))}
      </div>
      {err && <p className="msg-error" style={{ marginTop: '0.6rem' }}>{err}</p>}
      {msg && <p style={{ color: 'var(--green)', fontSize: '0.82rem', marginTop: '0.6rem' }}>{msg}</p>}
    </div>
  )
}
