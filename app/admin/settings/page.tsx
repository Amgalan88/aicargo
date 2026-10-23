'use client'
import { Tag, ImageUp, Megaphone, Calculator, Landmark, MapPin, Tags, ShoppingCart, Users, Plus, KeyRound, Trash2, ShieldCheck } from 'lucide-react'
import { confirmAsync } from '@/app/components/ConfirmDialog'
import { useState, useEffect } from 'react'
import EreenAddressExtras from '@/app/components/EreenAddressExtras'
import { parseExtraAddresses, type EreenAddress } from '@/lib/ereen-address'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Tier { min: string; price: string }

// Хэсгүүд — дээд талын товч цэс болон гарчигт ашиглана
const SECTIONS = [
  { id: 'st-brand', label: 'Лого' },
  { id: 'st-info', label: 'Мэдээлэл' },
  { id: 'st-price', label: 'Үнэ бодогч' },
  { id: 'st-bank', label: 'Данс' },
  { id: 'st-ereen', label: 'Эрээний хаяг' },
  { id: 'st-labels', label: 'Төлөвийн нэр' },
  { id: 'st-links', label: 'Линк захиалга' },
  { id: 'st-verify', label: 'Утас баталгаажуулалт' },
  { id: 'st-staff', label: 'Ажилтан' },
]

function Section({ id, icon: Icon, title, desc, locked, children }: {
  id: string; icon: React.ElementType; title: string; desc?: React.ReactNode; locked?: boolean; children: React.ReactNode
}) {
  return (
    <section id={id} className={`card st-sec${locked ? ' locked' : ''}`}>
      <header className="st-sec-head">
        <span className="st-sec-ic"><Icon size={18} strokeWidth={2} /></span>
        <div>
          <h2>{title}</h2>
          {desc && <p>{desc}</p>}
        </div>
      </header>
      {children}
      {locked && <p className="st-locked">Зөвхөн эзэн админ солих боломжтой.</p>}
    </section>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  // Линкээр захиалга — шилжүүлэгч дармагц шууд хадгалагдана
  const [linkOn, setLinkOn] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  async function toggleLinks() {
    if (linkBusy) return
    const next = !linkOn
    setLinkBusy(true)
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkOrdersEnabled: next }),
    }).catch(() => null)
    setLinkBusy(false)
    if (!res?.ok) { toast.error('Хадгалахад алдаа гарлаа'); return }
    setLinkOn(next)
    toast.success(next ? 'Линк захиалга нээгдлээ' : 'Линк захиалга хаагдлаа')
    router.refresh()
  }
  // Шинэ хэрэглэгчийн утас баталгаажуулалт (Verify.MN) — мөн дармагц хадгалагдана
  const [verifyOn, setVerifyOn] = useState(false)
  const [verifyBusy, setVerifyBusy] = useState(false)
  async function toggleVerify() {
    if (verifyBusy) return
    const next = !verifyOn
    setVerifyBusy(true)
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneVerify: next }),
    }).catch(() => null)
    setVerifyBusy(false)
    if (!res?.ok) { toast.error('Хадгалахад алдаа гарлаа'); return }
    setVerifyOn(next)
    toast.success(next ? 'Утас баталгаажуулалт асаалаа' : 'Утас баталгаажуулалт унтарлаа')
  }
  const [form, setForm] = useState({ tariff: '', priceCubic: '', priceWeight: '', priceWeightUnit: 'kg', announcement: '', contactInfo: '', bankName: '', bankAccountHolder: '', bankAccountNumber: '', bankTransferNote: '', arrivedLabel: '', ereemLabel: '', ereemReceiver: '', ereemPhone: '', ereemRegion: '', ereemAddress: '', ereemTitle: '', ereemAddresses: [] as EreenAddress[] })
  const [tiers, setTiers] = useState<Tier[]>([])
  const [cargo, setCargo] = useState<{ name: string; logoUrl?: string | null; batchEnabled?: boolean } | null>(null)
  const [me, setMe] = useState({ isStaffAdmin: false, canEditBank: false, canEditAddress: false, canEditLogo: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [logoBase64, setLogoBase64] = useState<string | null>(null)
  const [logoError, setLogoError] = useState('')
  // Ямар нэг өөрчлөлт орсон эсэхийг мэдэхийн тулд ачаалсан үеийн байдлыг хадгална
  const [baseline, setBaseline] = useState('')
  const [loaded, setLoaded] = useState<{ form: typeof form; tiers: Tier[] } | null>(null)

  const snapshotOf = (f: typeof form, t: Tier[], logo: string | null) => JSON.stringify([f, t, !!logo])
  const dirty = baseline !== '' && snapshotOf(form, tiers, logoBase64) !== baseline
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
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
        const loadedForm = { tariff: d.tariff ?? '', priceCubic: d.priceCubic ? String(Number(d.priceCubic)) : '', priceWeight: d.priceWeight ? String(Number(d.priceWeight)) : '', priceWeightUnit: d.priceWeightUnit === 't' ? 't' : 'kg', announcement: d.announcement ?? '', contactInfo: d.contactInfo ?? '', bankName: d.bankName ?? '', bankAccountHolder: d.bankAccountHolder ?? '', bankAccountNumber: d.bankAccountNumber ?? '', bankTransferNote: d.bankTransferNote ?? '', arrivedLabel: d.arrivedLabel ?? '', ereemLabel: d.ereemLabel ?? '', ereemReceiver: d.ereemReceiver ?? '', ereemPhone: d.ereemPhone ?? '', ereemRegion: d.ereemRegion ?? '', ereemAddress: d.ereemAddress ?? '', ereemTitle: d.ereemTitle ?? '', ereemAddresses: parseExtraAddresses(d.ereemAddresses) }
        let loadedTiers: Tier[] = []
        try {
          const parsed = d.priceWeightTiers ? JSON.parse(d.priceWeightTiers) : []
          if (Array.isArray(parsed)) loadedTiers = parsed.map((t: any) => ({ min: String(t.min), price: String(t.price) }))
        } catch {}
        setForm(loadedForm)
        setLinkOn(!!d.linkOrdersEnabled)
        setVerifyOn(!!d.phoneVerify)
        setTiers(loadedTiers)
        setLoaded({ form: loadedForm, tiers: loadedTiers })
        setBaseline(snapshotOf(loadedForm, loadedTiers, null))
        setLoading(false)
      })
  }, [])

  // Хадгалаагүй өөрчлөлттэй хуудсаас гарах үед сануулна
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  function discard() {
    if (!loaded) return
    setForm(loaded.form); setTiers(loaded.tiers); setLogoBase64(null); setLogoError(''); setSaveError('')
  }

  async function save() {
    if (saving || !dirty) return
    setSaving(true)
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
      setLoaded({ form, tiers })
      setBaseline(snapshotOf(form, tiers, null))
      // Цэсний "Эрээнд ирсэн"/"Ирсэн" шошгыг хуудас солихгүйгээр шууд шинэчилнэ
      window.dispatchEvent(new Event('admin-settings-saved'))
      // Цэс (жш: "Линк захиалга") серверээс ирдэг тул layout-ыг дахин ачаална
      router.refresh()
      toast.success('Амжилттай хадгалагдлаа')
    } catch {
      setSaveError('Холболтын алдаа гарлаа. Дахин оролдоно уу.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="st-page"><p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p></div>

  const allowBank = !me.isStaffAdmin || me.canEditBank
  const allowAddress = !me.isStaffAdmin || me.canEditAddress
  const allowLogo = !me.isStaffAdmin || me.canEditLogo
  const sections = SECTIONS.filter(s => s.id !== 'st-staff' || !me.isStaffAdmin)
  const unit = form.priceWeightUnit === 't' ? 'тонн' : 'кг'

  return (
    <div className="st-page">
      <div className="st-head">
        <h1 className="section-title" style={{ margin: 0 }}>Тохиргоо</h1>
        {cargo && <p>{cargo.name}</p>}
      </div>

      <nav className="st-jump" aria-label="Тохиргооны хэсгүүд">
        {sections.map(s => <a key={s.id} href={`#${s.id}`}>{s.label}</a>)}
      </nav>

      <Section id="st-brand" icon={ImageUp} title="Лого" desc="Вэб хаяг, апп-ын икон, нүүр хуудсанд харагдана." locked={!allowLogo}>
        <div className="st-logo">
          {(logoBase64 || cargo?.logoUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoBase64 || cargo!.logoUrl!} alt="Лого" />
          ) : (
            <span className="st-logo-empty"><Tag size={20} strokeWidth={2} /></span>
          )}
          <div>
            <label className={`btn btn-ghost btn-sm${allowLogo ? '' : ' disabled'}`}>
              <input type="file" accept="image/*" hidden onChange={handleLogo} disabled={!allowLogo} />
              {cargo?.logoUrl || logoBase64 ? 'Лого солих' : 'Лого оруулах'}
            </label>
            {logoBase64 && <p className="st-note accent">Шинэ лого сонгогдлоо — хадгалахаа мартуузай</p>}
            {logoError && <p className="st-note danger">{logoError}</p>}
            {!logoBase64 && !logoError && <p className="st-note">PNG, JPG · 3MB хүртэл · дөрвөлжин зураг гоё харагдана</p>}
          </div>
        </div>
      </Section>

      <Section id="st-info" icon={Megaphone} title="Хэрэглэгчид харагдах мэдээлэл" desc="Хэрэглэгчийн нүүр хуудсанд гарна. Хоосон талбар харагдахгүй.">
        <div className="form-group">
          <label>Анхааруулга <small>чухал мэдэгдэл</small></label>
          <textarea className="input" rows={2} placeholder="Баяр наадмын үеэр ачаа хүлээн авахгүй..." value={form.announcement} onChange={set('announcement')} />
        </div>
        <div className="st-grid">
          <div className="form-group">
            <label>Тариф <small>кг үнэ, дүрэм</small></label>
            <textarea className="input" rows={4} placeholder={'1кг — ₮8,500\n5кг дээш — ₮8,000'} value={form.tariff} onChange={set('tariff')} />
          </div>
          <div className="form-group">
            <label>Холбоо барих <small>утас, цаг, хаяг</small></label>
            <textarea className="input" rows={4} placeholder={'Утас: 99001122\nЦаг: Д-Б 09:00–18:00'} value={form.contactInfo} onChange={set('contactInfo')} />
          </div>
        </div>
      </Section>

      <Section id="st-price" icon={Calculator} title="Үнэ бодогч"
        desc={<>Хэрэглэгч хэмжээ, жингээ оруулж үнээ урьдчилан бодно — кубын болон жингийн үнийн <b>өндөр</b> нь баримтлагдана. Хоёулаа хоосон бол харагдахгүй.</>}>
        <div className="st-grid">
          <div className="form-group">
            <label>Кубын үнэ <small>₮ / м³</small></label>
            <input className="input" type="number" min="0" placeholder="жш: 350000" value={form.priceCubic} onChange={set('priceCubic')} />
          </div>
          <div className="form-group">
            <label>Жингийн үнэ <small>₮ / {unit}</small></label>
            <div className="st-unit">
              <input className="input" type="number" min="0" placeholder={form.priceWeightUnit === 't' ? 'жш: 3500000' : 'жш: 3500'} value={form.priceWeight} onChange={set('priceWeight')} />
              <div className="seg" role="group" aria-label="Жингийн нэгж">
                {(['kg', 't'] as const).map(u => (
                  <button key={u} type="button" className={form.priceWeightUnit === u ? 'on' : ''} aria-pressed={form.priceWeightUnit === u}
                    onClick={() => setForm(f => ({ ...f, priceWeightUnit: u }))}>{u === 'kg' ? 'кг' : 'тонн'}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {form.priceWeight && (
          <div className="st-tiers">
            <p className="st-sub">Шатлалтай үнэ <small>заавал биш — босго давбал НИЙТ жин тэр үнээр бодогдоно</small></p>
            {tiers.map((tier, i) => (
              <div key={i} className="st-tier">
                <input className="input" type="number" min="0" placeholder="100" aria-label="Босго жин"
                  value={tier.min} onChange={e => setTiers(ts => ts.map((t, j) => j === i ? { ...t, min: e.target.value } : t))} />
                <span>{unit}-аас дээш →</span>
                <input className="input" type="number" min="0" placeholder={form.priceWeightUnit === 't' ? '2000000' : '2000'} aria-label="Үнэ"
                  value={tier.price} onChange={e => setTiers(ts => ts.map((t, j) => j === i ? { ...t, price: e.target.value } : t))} />
                <span>₮/{unit}</span>
                <button type="button" className="st-x" aria-label="Шатлал хасах" onClick={() => setTiers(ts => ts.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
              </div>
            ))}
            <button type="button" className="st-add" onClick={() => setTiers(ts => [...ts, { min: '', price: '' }])}><Plus size={14} />Шатлал нэмэх</button>
          </div>
        )}
      </Section>

      <Section id="st-bank" icon={Landmark} title="Төлбөр төлөх данс" desc="Хэрэглэгч төлбөрөө шилжүүлэх данс. Хуулах товчтой харагдана." locked={!allowBank}>
        <div className="st-grid">
          <div className="form-group"><label>Банкны нэр</label><input className="input" disabled={!allowBank} placeholder="Хаан банк" value={form.bankName} onChange={set('bankName')} /></div>
          <div className="form-group"><label>Хүлээн авагчийн нэр</label><input className="input" disabled={!allowBank} placeholder="Овог Нэр" value={form.bankAccountHolder} onChange={set('bankAccountHolder')} /></div>
          <div className="form-group"><label>Дансны дугаар</label><input className="input" disabled={!allowBank} placeholder="5000123456" value={form.bankAccountNumber} onChange={set('bankAccountNumber')} /></div>
          <div className="form-group"><label>Гүйлгээний утга <small>заавар</small></label><input className="input" disabled={!allowBank} placeholder="Утасны дугаараа заавал бичнэ үү" value={form.bankTransferNote} onChange={set('bankTransferNote')} /></div>
        </div>
      </Section>

      <Section id="st-ereen" icon={MapPin} title="Эрээний хаяг" desc="Хэрэглэгч Хятадаас бараа захиалахдаа энэ хаягийг ашиглана." locked={!allowAddress}>
        <div className="st-grid">
          <div className="form-group"><label>收货人 <small>Хүлээн авагч</small></label><input className="input" disabled={!allowAddress} placeholder="жш: 王明" value={form.ereemReceiver} onChange={set('ereemReceiver')} /></div>
          <div className="form-group"><label>手机号 <small>Утас</small></label><input className="input" disabled={!allowAddress} placeholder="жш: 15848201234" value={form.ereemPhone} onChange={set('ereemPhone')} /></div>
        </div>
        <div className="form-group">
          <label>地区 <small>Бүс · тэмдгээр тусгаарлана</small></label>
          <input className="input" disabled={!allowAddress} placeholder="内蒙古 · 锡林郭勒盟 · 二连浩特市" value={form.ereemRegion} onChange={set('ereemRegion')} />
        </div>
        <div className="form-group">
          <label>详细地址 <small>Дэлгэрэнгүй хаяг</small></label>
          <input className="input" disabled={!allowAddress} placeholder="жш: XX小区 X号楼 XXX" value={form.ereemAddress} onChange={set('ereemAddress')} />
        </div>
        <EreenAddressExtras
          title={form.ereemTitle}
          onTitle={v => setForm(f => ({ ...f, ereemTitle: v }))}
          extras={form.ereemAddresses}
          onExtras={v => setForm(f => ({ ...f, ereemAddresses: v }))}
          disabled={!allowAddress}
        />
      </Section>

      <Section id="st-labels" icon={Tags} title="Төлөвийн нэр" desc='Ачааны төлөвийг өөрийнхөөрөө нэрлэж болно. Хоосон бол анхны нэрээр харагдана.'>
        <div className="st-grid">
          <div className="form-group"><label>"Эрээнд ирсэн"</label><input className="input" placeholder="жш: Эрээнээс ачигдсан" value={form.ereemLabel} onChange={set('ereemLabel')} /></div>
          <div className="form-group"><label>"Ирсэн"</label><input className="input" placeholder="жш: Дарханд ирсэн" value={form.arrivedLabel} onChange={set('arrivedLabel')} /></div>
        </div>
      </Section>

      <Section id="st-links" icon={ShoppingCart} title="Линкээр захиалга авах">
        <div className="st-toggle">
          <p id="link-orders-label">
            {linkOn
              ? 'Нээлттэй — хэрэглэгчид барааны линкээ илгээнэ. Хүсэлтүүд "Линк захиалга" цэсэнд ирнэ.'
              : 'Хаалттай — нээвэл хэрэглэгчид Taobao, Pinduoduo, 1688-ийн линкээ илгээж, та үнэ, төлбөрийг нь бүртгэнэ.'}
            <small>Дармагц шууд хадгалагдана.</small>
          </p>
          <button type="button" role="switch" aria-checked={linkOn} aria-labelledby="link-orders-label"
            className={`switch${linkOn ? ' on' : ''}`} disabled={me.isStaffAdmin || linkBusy} onClick={toggleLinks}>
            <span />
          </button>
        </div>
        {me.isStaffAdmin && <p className="st-locked">Зөвхөн каргогийн эзэмшигч өөрчилнө.</p>}
      </Section>

      <Section id="st-verify" icon={ShieldCheck} title="Шинэ хэрэглэгчийн утас баталгаажуулалт">
        <div className="st-toggle">
          <p id="phone-verify-label">
            {verifyOn
              ? 'Асаалттай — шинээр бүртгүүлэх хүн дугаараасаа 144773 руу код илгээж утсаа баталгаажуулна. Бусдын дугаараар бүртгүүлж ачааг нь авах боломжгүй.'
              : 'Унтраалттай — асаавал шинэ хэрэглэгч утсаа SMS-ээр (150₮, хэрэглэгч төлнө) баталгаажуулж бүртгүүлнэ. Одоо байгаа хэрэглэгчдэд нөлөөлөхгүй.'}
            <small>Дармагц шууд хадгалагдана. SMS баталгаажуулалт саатвал түр унтраана уу.</small>
          </p>
          <button type="button" role="switch" aria-checked={verifyOn} aria-labelledby="phone-verify-label"
            className={`switch${verifyOn ? ' on' : ''}`} disabled={me.isStaffAdmin || verifyBusy} onClick={toggleVerify}>
            <span />
          </button>
        </div>
        {me.isStaffAdmin && <p className="st-locked">Зөвхөн каргогийн эзэмшигч өөрчилнө.</p>}
      </Section>

      {/* Ажилтнууд — зөвхөн эзэн админд */}
      {!me.isStaffAdmin && (
        <Section id="st-staff" icon={Users} title="Ажилтан" desc="Ажилтан тус бүр өөрийн утас, нууц үгээр нэвтэрнэ. Ажилтан нэмэх эрх зөвхөн танд байна.">
          <StaffAdminSection />
          {cargo?.batchEnabled && <EreenStaffSection />}
        </Section>
      )}

      {/* Хадгалах самбар — өөрчлөлт орох үед доор гарна */}
      <div className={`st-savebar${dirty || saveError ? ' show' : ''}`} role="region" aria-label="Хадгалах">
        <span className={saveError ? 'danger' : ''}>{saveError || 'Хадгалаагүй өөрчлөлт байна'}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={discard} disabled={saving}>Болих</button>
        <button type="button" className="btn btn-sm" onClick={save} disabled={saving || !dirty}>{saving ? 'Хадгалж байна…' : 'Хадгалах'}</button>
      </div>
    </div>
  )
}

interface Staff { id: number; name: string; phone: string }

// Шинэ ажилтны маягт — "+ Нэмэх" дармагц нээгдэнэ
function NewStaffForm({ busy, onCreate, onCancel, children }: {
  busy: boolean
  onCreate: (f: { name: string; phone: string; password: string }) => Promise<boolean>
  onCancel: () => void
  children?: React.ReactNode
}) {
  const [f, setF] = useState({ name: '', phone: '', password: '' })
  const ok = f.name.trim().length >= 2 && /^\d{8}$/.test(f.phone) && f.password.length >= 6
  return (
    <form className="st-newstaff" onSubmit={async e => { e.preventDefault(); if (ok && await onCreate(f)) setF({ name: '', phone: '', password: '' }) }}>
      <div className="st-grid3">
        <div className="form-group"><label>Нэр</label><input className="input" placeholder="Ажилтны нэр" value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} /></div>
        <div className="form-group"><label>Утас</label><input className="input" type="tel" maxLength={8} placeholder="99001122" value={f.phone} onChange={e => setF(x => ({ ...x, phone: e.target.value.replace(/\D/g, '').slice(0, 8) }))} /></div>
        <div className="form-group"><label>Нууц үг</label><input className="input" type="text" placeholder="6+ тэмдэгт" value={f.password} onChange={e => setF(x => ({ ...x, password: e.target.value }))} /></div>
      </div>
      {children}
      <div className="st-newstaff-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Болих</button>
        <button className="btn btn-sm" disabled={busy || !ok}>{busy ? 'Үүсгэж байна…' : 'Үүсгэх'}</button>
      </div>
    </form>
  )
}

function StaffRow({ name, phone, onReset, onRemove, children }: { name: string; phone: string; onReset: () => void; onRemove: () => void; children?: React.ReactNode }) {
  return (
    <div className="st-staff">
      <div className="st-staff-top">
        <span className="st-avatar" aria-hidden>{name.trim().charAt(0).toUpperCase() || '?'}</span>
        <div className="st-staff-name"><b>{name}</b><span>{phone}</span></div>
        <button type="button" className="st-icon" title="Нууц үг солих" aria-label={`${name} — нууц үг солих`} onClick={onReset}><KeyRound size={15} /></button>
        <button type="button" className="st-icon danger" title="Устгах" aria-label={`${name} — устгах`} onClick={onRemove}><Trash2 size={15} /></button>
      </div>
      {children}
    </div>
  )
}

function EreenStaffSection() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  function load() {
    fetch('/api/admin/ereen-staff')
      .then(r => r.ok ? r.json() : [])
      .then(setStaff)
      .catch(() => {})
  }
  useEffect(() => { load() }, [])

  async function create(form: { name: string; phone: string; password: string }) {
    setBusy(true)
    const res = await fetch('/api/admin/ereen-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setBusy(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(d.error || 'Алдаа гарлаа'); return false }
    toast.success('Нэвтрэлт үүслээ')
    setAdding(false)
    load()
    return true
  }

  async function resetPw(id: number) {
    const pw = prompt('Шинэ нууц үг (6+ тэмдэгт):')
    if (!pw || pw.length < 6) return
    const res = await fetch('/api/admin/ereen-staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password: pw }),
    })
    if (res.ok) toast.success('Нууц үг солигдлоо'); else toast.error('Алдаа гарлаа')
  }

  async function remove(id: number) {
    if (!await confirmAsync('Энэ нэвтрэлтийг устгах уу?')) return
    await fetch('/api/admin/ereen-staff', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  return (
    <div className="st-group">
      <div className="st-group-head">
        <div>
          <b>Эрээний ажилтан</b>
          <p>Зөвхөн багц бүртгэлийн хуудсыг харна (₮/¥ хэл солигддог).</p>
        </div>
        {!adding && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}><Plus size={14} />Нэмэх</button>}
      </div>
      {staff.map(s => <StaffRow key={s.id} name={s.name} phone={s.phone} onReset={() => resetPw(s.id)} onRemove={() => remove(s.id)} />)}
      {!staff.length && !adding && <p className="st-empty">Одоогоор Эрээний ажилтан алга.</p>}
      {adding && <NewStaffForm busy={busy} onCreate={create} onCancel={() => setAdding(false)} />}
    </div>
  )
}

interface StaffAdmin { id: number; name: string; phone: string; canEditBank: boolean; canEditAddress: boolean; canEditLogo: boolean }
type PermKey = 'canEditBank' | 'canEditAddress' | 'canEditLogo'

const PERM_OPTIONS: { key: PermKey; label: string }[] = [
  { key: 'canEditBank', label: 'Данс' },
  { key: 'canEditAddress', label: 'Эрээний хаяг' },
  { key: 'canEditLogo', label: 'Лого' },
]

function PermChips({ value, onToggle }: { value: Record<PermKey, boolean>; onToggle: (k: PermKey) => void }) {
  return (
    <div className="st-perms">
      <span>Засах эрх:</span>
      {PERM_OPTIONS.map(p => (
        <button key={p.key} type="button" className={`st-perm${value[p.key] ? ' on' : ''}`} aria-pressed={value[p.key]} onClick={() => onToggle(p.key)}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

function StaffAdminSection() {
  const [staff, setStaff] = useState<StaffAdmin[]>([])
  const [adding, setAdding] = useState(false)
  const [perms, setPerms] = useState<Record<PermKey, boolean>>({ canEditBank: false, canEditAddress: false, canEditLogo: false })
  const [busy, setBusy] = useState(false)

  function load() {
    fetch('/api/admin/staff-admin')
      .then(r => r.ok ? r.json() : [])
      .then(setStaff)
      .catch(() => {})
  }
  useEffect(() => { load() }, [])

  async function create(form: { name: string; phone: string; password: string }) {
    setBusy(true)
    const res = await fetch('/api/admin/staff-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ...perms }),
    })
    setBusy(false)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(d.error || 'Алдаа гарлаа'); return false }
    toast.success('Ажилтан admin нэвтрэлт үүслээ')
    setPerms({ canEditBank: false, canEditAddress: false, canEditLogo: false })
    setAdding(false)
    load()
    return true
  }

  async function togglePerm(s: StaffAdmin, key: PermKey) {
    const next = !s[key]
    setStaff(prev => prev.map(x => x.id === s.id ? { ...x, [key]: next } : x)) // optimistic
    const res = await fetch('/api/admin/staff-admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, [key]: next }),
    })
    if (!res.ok) { setStaff(prev => prev.map(x => x.id === s.id ? { ...x, [key]: s[key] } : x)); toast.error('Алдаа гарлаа') } // revert on failure
  }

  async function resetPw(id: number) {
    const pw = prompt('Шинэ нууц үг (6+ тэмдэгт):')
    if (!pw || pw.length < 6) return
    const res = await fetch('/api/admin/staff-admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password: pw }),
    })
    if (res.ok) toast.success('Нууц үг солигдлоо'); else toast.error('Алдаа гарлаа')
  }

  async function remove(id: number) {
    if (!await confirmAsync('Энэ ажилтны admin нэвтрэлтийг устгах уу?')) return
    await fetch('/api/admin/staff-admin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  return (
    <div className="st-group">
      <div className="st-group-head">
        <div>
          <b>Ажилтан admin</b>
          <p>Бүртгэл, олголт, мэдэгдэл хийнэ. Данс, хаяг, логог зөвхөн зөвшөөрсөн эрхээр засна.</p>
        </div>
        {!adding && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}><Plus size={14} />Нэмэх</button>}
      </div>
      {staff.map(s => (
        <StaffRow key={s.id} name={s.name} phone={s.phone} onReset={() => resetPw(s.id)} onRemove={() => remove(s.id)}>
          <PermChips value={s} onToggle={k => togglePerm(s, k)} />
        </StaffRow>
      ))}
      {!staff.length && !adding && <p className="st-empty">Одоогоор ажилтан admin алга.</p>}
      {adding && (
        <NewStaffForm busy={busy} onCreate={create} onCancel={() => setAdding(false)}>
          <PermChips value={perms} onToggle={k => setPerms(p => ({ ...p, [k]: !p[k] }))} />
        </NewStaffForm>
      )}
    </div>
  )
}
