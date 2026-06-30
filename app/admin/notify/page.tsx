'use client'
import { useState, useEffect, useRef } from 'react'

interface Banner {
  id: number
  content: string
  imageUrl: string | null
  expiresAt: string | null
  createdAt: string
}

function BannerPreviewModal({ banner, onClose }: { banner: Banner; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 16,
          padding: '1.75rem 1.5rem 1.5rem',
          maxWidth: 420, width: '100%',
          boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
          border: '1px solid var(--border)',
          position: 'relative',
        }}
      >
        <div style={{
          position: 'absolute', top: '-2rem', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)', borderRadius: 100,
          padding: '0.2rem 0.8rem', fontSize: '0.72rem', color: '#fff', whiteSpace: 'nowrap',
        }}>
          👁 User-ийн харагдах байдал
        </div>
        <button
          onClick={onClose}
          aria-label="Хаах"
          style={{
            position: 'absolute', top: '0.75rem', right: '0.75rem',
            background: 'var(--surface2)', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', borderRadius: '50%',
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.9rem',
          }}
        >✕</button>

        {banner.imageUrl && (
          <img
            src={banner.imageUrl}
            alt=""
            style={{ width: '100%', borderRadius: 10, marginBottom: '1rem', maxHeight: 240, objectFit: 'cover' }}
          />
        )}
        <p style={{ fontSize: '0.95rem', lineHeight: 1.65, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {banner.content}
        </p>
        {banner.expiresAt && (
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.75rem' }}>
            {new Date(banner.expiresAt).toLocaleString('mn-MN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} хүртэл
          </p>
        )}
        <button className="btn" style={{ marginTop: '1.25rem', width: '100%' }}>
          Ойлголоо
        </button>
      </div>
    </div>
  )
}

function BannerSection() {
  const [banner, setBanner] = useState<Banner | null | undefined>(undefined)
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const [pendingForm, setPendingForm] = useState<{ content: string; imageUrl: string; expiresAt: string } | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/banner')
      .then(r => r.ok ? r.json() : null)
      .then(d => setBanner(d))
      .catch(() => setBanner(null))
  }, [])

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImg(true)
    setError('')
    try {
      const sigRes = await fetch('/api/admin/banner/upload-signature')
      const { signature, timestamp, publicId, folder, apiKey, cloudName } = await sigRes.json()

      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', apiKey)
      formData.append('timestamp', timestamp)
      formData.append('signature', signature)
      formData.append('folder', folder)
      formData.append('public_id', publicId)

      const upRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await upRes.json()
      if (!upRes.ok) throw new Error(data.error?.message ?? 'Upload алдаа')
      setImageUrl(data.secure_url)
    } catch {
      setError('Зураг upload хийхэд алдаа гарлаа')
    } finally {
      setUploadingImg(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handleSubmit() {
    setError('')
    if (!content.trim()) { setError('Мэдэгдлийн текст хоосон байна'); return }
    if (banner) {
      setPendingForm({ content, imageUrl, expiresAt })
      setConfirmNew(true)
    } else {
      doSave(content, imageUrl, expiresAt)
    }
  }

  async function doSave(c: string, img: string, exp: string) {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/admin/banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: c, imageUrl: img || null, expiresAt: exp || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBanner(data)
      setContent('')
      setImageUrl('')
      setExpiresAt('')
      setSuccess('Мэдэгдэл амжилттай үүслээ')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message ?? 'Алдаа гарлаа')
    } finally {
      setSaving(false)
    }
  }

  async function deleteBanner() {
    setSaving(true)
    setError('')
    await fetch('/api/admin/banner', { method: 'DELETE' })
    setBanner(null)
    setSaving(false)
    setSuccess('Мэдэгдэл устгагдлаа')
    setTimeout(() => setSuccess(''), 3000)
  }

  if (banner === undefined) return <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Ачааллаж байна...</p>

  return (
    <>
    {previewing && <BannerPreviewModal banner={{ id: 0, content: content.trim() || banner?.content || '', imageUrl: imageUrl || banner?.imageUrl || null, expiresAt: expiresAt || banner?.expiresAt || null, createdAt: '' }} onClose={() => setPreviewing(false)} />}
    <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
        Хэрэглэгчид харуулах мэдэгдэл (Banner)
      </p>

      {banner && (
        <div style={{
          background: 'var(--accent-light)', borderRadius: 10, padding: '1rem',
          border: '1px solid #f0c9b5', marginBottom: '1.25rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.35rem' }}>
                Идэвхтэй мэдэгдэл
              </p>
              {banner.imageUrl && (
                <img src={banner.imageUrl} alt="" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, marginBottom: '0.5rem' }} />
              )}
              <p style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap', color: 'var(--text)', marginBottom: '0.35rem' }}>{banner.content}</p>
              {banner.expiresAt ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  Дуусах цаг: {new Date(banner.expiresAt).toLocaleString('mn-MN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              ) : (
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Цаггүй — гар аргаар устгах хүртэл</p>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <button
                onClick={() => setPreviewing(true)}
                style={{
                  background: 'none', border: '1px solid var(--accent)', color: 'var(--accent)',
                  borderRadius: 8, padding: '0.3rem 0.6rem', cursor: 'pointer',
                  fontSize: '0.78rem', fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
              >
                👁 Харах
              </button>
              <button
                onClick={deleteBanner}
                disabled={saving}
                style={{
                  background: 'none', border: '1px solid var(--danger)', color: 'var(--danger)',
                  borderRadius: 8, padding: '0.3rem 0.6rem', cursor: 'pointer',
                  fontSize: '0.78rem', fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
              >
                Устгах
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="form-group">
        <label>Мэдэгдлийн текст <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(emoji, тэмдэгт дэмжинэ)</span></label>
        <textarea
          className="input"
          rows={4}
          placeholder={'Маргааш ачаа буун 7 хүртэл ажиллана 🚛'}
          value={content}
          onChange={e => setContent(e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      <div className="form-group">
        <label>Зураг <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(заавал биш)</span></label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingImg}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '0.5rem 0.9rem', cursor: 'pointer',
              color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.85rem',
            }}
          >
            {uploadingImg ? 'Байршуулж байна...' : '📎 Зураг сонгох'}
          </button>
          {imageUrl && (
            <>
              <img src={imageUrl} alt="" style={{ height: 48, borderRadius: 6, objectFit: 'cover' }} />
              <button
                onClick={() => setImageUrl('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '0.85rem' }}
              >
                ✕ Хасах
              </button>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageFile} />
      </div>

      <div className="form-group">
        <label>Дуусах цаг <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>(хоосон бол гар аргаар устгах хүртэл харагдана)</span></label>
        <input
          className="input"
          type="datetime-local"
          value={expiresAt}
          onChange={e => setExpiresAt(e.target.value)}
          style={{ maxWidth: 240 }}
        />
      </div>

      {error && <p className="msg-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
      {success && <p style={{ fontSize: '0.82rem', color: 'var(--green)', marginBottom: '0.75rem' }}>✓ {success}</p>}

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => {
            if (content.trim()) setPreviewing(true)
            else setError('Эхлээд текст бичнэ үү')
          }}
          disabled={uploadingImg}
          style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '0.7rem 1.2rem', cursor: 'pointer',
            color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600,
          }}
        >
          👁 Урьдчилан харах
        </button>
        <button className="btn" onClick={handleSubmit} disabled={saving || uploadingImg || !content.trim()}>
          {saving ? 'Хадгалж байна...' : banner ? 'Шинэ мэдэгдэл тохируулах' : 'Мэдэгдэл үүсгэх'}
        </button>
      </div>

      {confirmNew && pendingForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, padding: '1rem',
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 360, padding: '1.5rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>⚠️ Анхааруулга</p>
            <p style={{ fontSize: '0.88rem', color: 'var(--muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Одоо байгаа мэдэгдэл <strong style={{ color: 'var(--danger)' }}>устгагдаж</strong> шинэ мэдэгдэл үүснэ. Үргэлжлүүлэх үү?
            </p>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                className="btn"
                onClick={() => {
                  setConfirmNew(false)
                  doSave(pendingForm.content, pendingForm.imageUrl, pendingForm.expiresAt)
                  setPendingForm(null)
                }}
                style={{ flex: 1 }}
              >
                Тийм, үүсгэх
              </button>
              <button
                onClick={() => { setConfirmNew(false); setPendingForm(null) }}
                style={{
                  flex: 1, padding: '0.6rem', borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)', background: 'var(--surface2)',
                  color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem',
                }}
              >
                Болих
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  )
}

export default function NotifyPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ sent: number; noEmail: number; failed: number } | null>(null)
  const [error, setError] = useState('')
  const [closingTime, setClosingTime] = useState('18:00')
  const [confirmData, setConfirmData] = useState<{ count: number } | null>(null)
  const [canSend, setCanSend] = useState(true)
  const [nextAllowedAt, setNextAllowedAt] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/notify-all')
      .then(r => r.json())
      .then(d => { setCanSend(d.canSend); setNextAllowedAt(d.nextAllowedAt ?? null) })
      .catch(() => {})
  }, [])

  async function handleSendClick() {
    setError('')
    const res = await fetch('/api/admin/notify-all')
    if (!res.ok) { setError('Алдаа гарлаа'); return }
    const data = await res.json()
    if (!data.canSend) { setCanSend(false); setNextAllowedAt(data.nextAllowedAt); return }
    setConfirmData({ count: data.count })
  }

  async function confirmSend() {
    setConfirmData(null)
    setLoading(true)
    setResult(null)
    const res = await fetch('/api/admin/notify-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closingTime }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setResult(data)
  }

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <h1 className="section-title">Мэдэгдэл</h1>

      <BannerSection />

      <div className="card" style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
          И-мэйл мэдэгдэл илгээх
        </p>

        <div className="form-group">
          <label>Өнөөдөр хэдэн цаг хүртэл ажиллах вэ?</label>
          <input className="input" type="time" value={closingTime}
            onChange={e => setClosingTime(e.target.value)}
            style={{ maxWidth: 160 }} />
        </div>

        <button className="btn" onClick={handleSendClick} disabled={loading || !closingTime || !canSend} style={{ marginTop: '0.5rem' }}>
          {loading ? 'Илгээж байна...' : 'Мэдэгдэл илгээх'}
        </button>

        {!canSend && nextAllowedAt && (
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.6rem' }}>
            Дараагийн илгээлт: <strong style={{ color: 'var(--text)' }}>
              {new Date(nextAllowedAt).toLocaleString('mn-MN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </strong>
          </p>
        )}

        {error && <p className="msg-error" style={{ marginTop: '1rem' }}>{error}</p>}

        {result && (
          <div className="card" style={{ marginTop: '1.2rem' }}>
            <div className="card-row">
              <span className="label">Илгээгдсэн</span>
              <strong style={{ color: 'var(--green)' }}>{result.sent} хэрэглэгч</strong>
            </div>
            {result.noEmail > 0 && (
              <div className="card-row">
                <span className="label">И-мэйлгүй</span>
                <span style={{ color: 'var(--muted)' }}>{result.noEmail} хэрэглэгч</span>
              </div>
            )}
            {result.failed > 0 && (
              <div className="card-row">
                <span className="label">Илгээхэд алдаа</span>
                <span style={{ color: 'var(--danger)' }}>{result.failed} хэрэглэгч</span>
              </div>
            )}
          </div>
        )}
      </div>

      {confirmData !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: 340, padding: '1.5rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Мэдэгдэл илгээх</p>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
              <strong style={{ color: 'var(--text)', fontSize: '1.2rem' }}>{confirmData.count}</strong> хэрэглэгчид мэдэгдэл илгээх үү?
            </p>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button className="btn" onClick={confirmSend} style={{ flex: 1 }}>Илгээх</button>
              <button onClick={() => setConfirmData(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem' }}>Болих</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
