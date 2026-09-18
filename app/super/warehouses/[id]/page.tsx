'use client'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  WAREHOUSE_IMAGE_CATEGORIES, MAX_GALLERY_IMAGES, cloudinaryThumb, formatMnt,
} from '@/lib/warehouse'
import { resizeImage } from '@/lib/image-resize'

interface GalleryImage {
  id: number
  url: string
  caption: string | null
  category: string
  order: number
}

interface Warehouse {
  id: number
  name: string
  slug: string | null
  imageUrl: string | null
  active: boolean
  legalNameMn: string | null
  legalNameCn: string | null
  registerNo: string | null
  directorName: string | null
  bankName: string | null
  bankAccount: string | null
  bankHolder: string | null
  contractFee: string
  services: string | null
  pricePerTonCny: string | null
  pricePerM3Cny: string | null
  pricePerKgMnt: string | null
  acceptingContracts: boolean
  receiveRegion: string | null
  receiveAddress: string | null
  receivePhone: string | null
  images: GalleryImage[]
}

const FORM_KEYS = [
  'slug', 'legalNameMn', 'legalNameCn', 'registerNo', 'directorName',
  'bankName', 'bankAccount', 'bankHolder', 'contractFee', 'services',
  'pricePerTonCny', 'pricePerM3Cny', 'pricePerKgMnt',
  'receiveRegion', 'receiveAddress', 'receivePhone',
] as const
type FormKey = typeof FORM_KEYS[number]
type Form = Record<FormKey, string> & { acceptingContracts: boolean }

function toForm(w: Warehouse): Form {
  const f = { acceptingContracts: w.acceptingContracts } as Form
  for (const k of FORM_KEYS) f[k] = w[k] == null ? '' : String(w[k])
  if (f.contractFee) f.contractFee = String(Math.round(Number(f.contractFee)))
  return f
}

export default function WarehouseSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [wh, setWh] = useState<Warehouse | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [images, setImages] = useState<GalleryImage[]>([])
  const [uploadCategory, setUploadCategory] = useState('GENERAL')
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const load = useCallback(async () => {
    const res = await fetch(`/api/super/warehouses/${id}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setLoadError(data.error || 'Ачаалахад алдаа гарлаа'); return }
    setWh(data)
    setForm(toForm(data))
    setImages(data.images)
  }, [id])
  useEffect(() => { load() }, [load])

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(f => f && ({ ...f, [k]: v }))
  }

  async function save() {
    if (!form) return
    setSaving(true)
    setError('')
    const res = await fetch(`/api/super/warehouses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Алдаа гарлаа'); return }
    setWh(w => w && { ...w, ...data })
    setForm(toForm({ ...wh!, ...data }))
    toast.success('Хадгалагдлаа')
    // Холбоос солигдсон бол layout-ийн "Нийтийн хуудас" линк шинэчлэгдэнэ
    router.refresh()
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return
    const list = Array.from(files).filter(f => f.type.startsWith('image/'))
    const room = MAX_GALLERY_IMAGES - images.length
    if (room <= 0) { toast.error(`Хамгийн ихдээ ${MAX_GALLERY_IMAGES} зураг`); return }
    const batch = list.slice(0, room)
    if (batch.length < list.length) toast.warning(`Зөвхөн эхний ${batch.length} зургийг оруулна`)

    setUploading({ done: 0, total: batch.length })
    let failed = 0
    for (const file of batch) {
      try {
        const imageBase64 = await resizeImage(file)
        const res = await fetch(`/api/super/warehouses/${id}/images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64, category: uploadCategory }),
        })
        if (!res.ok) throw new Error()
        const img: GalleryImage = await res.json()
        setImages(prev => [...prev, img])
      } catch {
        failed++
      }
      setUploading(u => u && { ...u, done: u.done + 1 })
    }
    setUploading(null)
    if (fileRef.current) fileRef.current.value = ''
    if (failed) toast.error(`${failed} зураг оруулж чадсангүй`)
    else toast.success(`${batch.length} зураг нэмэгдлээ`)
    // Нүүр зураг автоматаар тохируулагдсан байж болно
    if (!wh?.imageUrl) load()
  }

  async function patchImage(imgId: number, patch: Partial<Pick<GalleryImage, 'caption' | 'category'>>) {
    setImages(prev => prev.map(i => i.id === imgId ? { ...i, ...patch } : i))
    const res = await fetch(`/api/super/warehouses/${id}/images`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: imgId, ...patch }),
    })
    if (!res.ok) { toast.error('Хадгалж чадсангүй'); load() }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= images.length) return
    const next = [...images]
    ;[next[index], next[target]] = [next[target], next[index]]
    setImages(next)
    const res = await fetch(`/api/super/warehouses/${id}/images`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next.map(i => i.id) }),
    })
    if (!res.ok) { toast.error('Дараалал хадгалагдсангүй'); load() }
  }

  async function setCover(imgId: number) {
    const res = await fetch(`/api/super/warehouses/${id}/images`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverId: imgId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error || 'Алдаа гарлаа'); return }
    setWh(w => w && { ...w, imageUrl: data.imageUrl })
    toast.success('Нүүр зураг солигдлоо')
  }

  async function removeImage(imgId: number) {
    if (!confirm('Энэ зургийг устгах уу?')) return
    const res = await fetch(`/api/super/warehouses/${id}/images`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: imgId }),
    })
    if (!res.ok) { toast.error('Устгаж чадсангүй'); return }
    setImages(prev => prev.filter(i => i.id !== imgId))
    load()
  }

  if (loadError) return <p className="msg-error">{loadError}</p>
  if (!wh || !form) return <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>

  return (
    <div>
      <div className="card" style={cardStyle}>
        <h2 style={h2}>Нийтийн хуудас</h2>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Холбоос (slug)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>aicargo.mn/warehouses/</span>
            <input className="input" placeholder="naran-teever" value={form.slug}
              onChange={e => set('slug', e.target.value.toLowerCase())} />
          </div>
          <p style={hint}>Хоосон бол /warehouses/{wh.id} хаягаар нээгдэнэ.</p>
        </div>
      </div>

      <div className="card" style={cardStyle}>
        <h2 style={h2}>Хуулийн мэдээлэл <span style={subtle}>(гэрээнд орно)</span></h2>
        <div className="admin-form-2col">
          <Field label="Нэр (монгол)" placeholder='БНХАУлсын "Наран тээвэр" ХХК'
            value={form.legalNameMn} onChange={v => set('legalNameMn', v)} />
          <Field label="Нэр (хятад)" placeholder="内蒙古那仁货运代理有限公司"
            value={form.legalNameCn} onChange={v => set('legalNameCn', v)} />
          <Field label="Регистр №" placeholder="91152501MAK6XOACOX"
            value={form.registerNo} onChange={v => set('registerNo', v)} />
          <Field label="Захирал (овог, нэр)" placeholder="Тэрбиш овогтой Алтантуяа"
            value={form.directorName} onChange={v => set('directorName', v)} />
        </div>
      </div>

      <div className="card" style={{ ...cardStyle, borderColor: 'var(--accent)' }}>
        <h2 style={h2}>Гэрээний төлбөр хүлээн авах данс</h2>
        <p style={{ ...hint, marginTop: 0, marginBottom: '0.9rem' }}>
          Карго гэрээ байгуулахдаа төлбөрөө шууд энэ данс руу шилжүүлнэ. Агуулах өөрөө засах боломжгүй,
          нийтийн хуудсанд харагдахгүй.
        </p>
        <div className="admin-form-2col">
          <Field label="Банк" placeholder="Хаан банк" value={form.bankName} onChange={v => set('bankName', v)} />
          <Field label="Дансны дугаар" placeholder="5925056082" value={form.bankAccount} onChange={v => set('bankAccount', v)} />
          <Field label="Данс эзэмшигч" placeholder="Т. Алтантуяа" value={form.bankHolder} onChange={v => set('bankHolder', v)} />
          <Field label="Гэрээний төлбөр (₮, нэг удаагийн)" placeholder="1200000" inputMode="numeric"
            value={form.contractFee} onChange={v => set('contractFee', v.replace(/[^\d]/g, ''))}
            hint={form.contractFee ? formatMnt(form.contractFee) + ' · буцаагдахгүй' : undefined} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginTop: '0.9rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.acceptingContracts}
            onChange={e => set('acceptingContracts', e.target.checked)} />
          Шинэ гэрээ хүлээн авч байна
        </label>
      </div>

      <div className="card" style={cardStyle}>
        <h2 style={h2}>Ачаа хүлээн авах хаяг <span style={subtle}>(гэрээтэй каргод олгоно)</span></h2>
        <p style={{ ...hint, marginTop: 0, marginBottom: '0.9rem' }}>
          Гэрээ батлагдахад карго энэ хаягийг өөрийн тэмдэгтэйгээр (жш: B88) авч, вэбсайтдаа нэг товчоор тохируулна.
        </p>
        <div className="admin-form-2col">
          <Field label="Бүс (地区)" placeholder="内蒙古自治区 · 锡林郭勒盟 · 二连浩特市"
            value={form.receiveRegion} onChange={v => set('receiveRegion', v)} />
          <Field label="Хүлээн авах утас (手机号)" placeholder="18647933620" inputMode="tel"
            value={form.receivePhone} onChange={v => set('receivePhone', v)} />
          <Field label="Дэлгэрэнгүй хаяг (详细地址)" placeholder="社区建设管理区环宇商贸城9栋24号"
            value={form.receiveAddress} onChange={v => set('receiveAddress', v)}
            hint={form.receiveAddress ? `Каргод: ${form.receiveAddress} B88 + нэр + утас` : undefined} />
        </div>
      </div>

      <div className="card" style={cardStyle}>
        <h2 style={h2}>Тариф ба үйлчилгээ</h2>
        <div className="admin-form-2col">
          <Field label="1 тонн (юань)" placeholder="жш: 1200" inputMode="decimal"
            value={form.pricePerTonCny} onChange={v => set('pricePerTonCny', v)} />
          <Field label="1 м³ (юань)" placeholder="жш: 450" inputMode="decimal"
            value={form.pricePerM3Cny} onChange={v => set('pricePerM3Cny', v)} />
          <Field label="1 кг (төгрөг)" placeholder="жш: 2500" inputMode="decimal"
            value={form.pricePerKgMnt} onChange={v => set('pricePerKgMnt', v)} />
        </div>
        <div className="form-group" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          <label>Үйлчилгээ</label>
          <textarea className="input" rows={5} value={form.services}
            placeholder={'Мөр бүрт нэг үйлчилгээ:\nЖижиг ачаа хүлээн авч ангилах\nБаглаа боодол\nГаалийн хашаа хүртэл үнэгүй зөөвөрлөх'}
            onChange={e => set('services', e.target.value)} />
        </div>
      </div>

      {error && <p className="msg-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
      <button className="btn" onClick={save} disabled={saving} style={{ marginBottom: '2rem' }}>
        {saving ? 'Хадгалж байна...' : 'Мэдээлэл хадгалах'}
      </button>

      <div className="card" style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={h2}>Зургийн галерей</h2>
          <span style={subtle}>{images.length} / {MAX_GALLERY_IMAGES}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <select className="input" value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}
            style={{ width: 'auto' }} disabled={!!uploading}>
            {WAREHOUSE_IMAGE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={e => upload(e.target.files)} />
          <button className="btn" onClick={() => fileRef.current?.click()}
            disabled={!!uploading || images.length >= MAX_GALLERY_IMAGES}>
            {uploading ? `Оруулж байна ${uploading.done}/${uploading.total}...` : '+ Зураг нэмэх (олноор)'}
          </button>
        </div>

        {images.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>Зураг оруулаагүй байна.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.75rem' }}>
            {images.map((img, i) => {
              const isCover = wh.imageUrl === img.url
              return (
                <div key={img.id} style={{
                  border: `1px solid ${isCover ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 10, overflow: 'hidden', background: 'var(--surface)',
                }}>
                  <div style={{ position: 'relative' }}>
                    <a href={img.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cloudinaryThumb(img.url, 400)} alt={img.caption ?? ''}
                        style={{ width: '100%', aspectRatio: '3 / 2', objectFit: 'cover', display: 'block' }} />
                    </a>
                    {isCover && (
                      <span style={{
                        position: 'absolute', top: 6, left: 6, background: 'var(--accent)', color: '#fff',
                        fontSize: '0.65rem', fontWeight: 700, borderRadius: 100, padding: '0.1rem 0.5rem',
                      }}>Нүүр</span>
                    )}
                  </div>
                  <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <select className="input" value={img.category} style={{ fontSize: '0.78rem', padding: '0.3rem 0.4rem' }}
                      onChange={e => patchImage(img.id, { category: e.target.value })}>
                      {WAREHOUSE_IMAGE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <input className="input" placeholder="Тайлбар" defaultValue={img.caption ?? ''}
                      style={{ fontSize: '0.78rem', padding: '0.3rem 0.4rem' }}
                      onBlur={e => {
                        if (e.target.value.trim() !== (img.caption ?? '')) patchImage(img.id, { caption: e.target.value })
                      }} />
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button style={iconBtn} onClick={() => move(i, -1)} disabled={i === 0} title="Өмнө">←</button>
                      <button style={iconBtn} onClick={() => move(i, 1)} disabled={i === images.length - 1} title="Хойно">→</button>
                      {!isCover && <button style={iconBtn} onClick={() => setCover(img.id)} title="Нүүр зураг болгох">★</button>}
                      <button style={{ ...iconBtn, marginLeft: 'auto', color: 'var(--danger)' }}
                        onClick={() => removeImage(img.id)} title="Устгах">🗑</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, hint: hintText, inputMode }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  inputMode?: 'numeric' | 'decimal' | 'tel'
}) {
  return (
    <div className="form-group" style={{ margin: 0 }}>
      <label>{label}</label>
      <input className="input" value={value} placeholder={placeholder} inputMode={inputMode}
        onChange={e => onChange(e.target.value)} />
      {hintText && <p style={hint}>{hintText}</p>}
    </div>
  )
}

const cardStyle: React.CSSProperties = { padding: '1.25rem', marginBottom: '1rem' }
const h2: React.CSSProperties = { fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.9rem' }
const subtle: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 500 }
const hint: React.CSSProperties = { fontSize: '0.74rem', color: 'var(--muted)', margin: '0.3rem 0 0' }
const iconBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', cursor: 'pointer',
  padding: '0.25rem 0.5rem', borderRadius: 6, fontSize: '0.8rem', lineHeight: 1, color: 'var(--text)',
}
