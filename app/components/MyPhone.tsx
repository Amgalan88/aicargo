'use client'
// Миний утас: одоогийн дугаараа SMS-ээр баталгаажуулна (✓), эсвэл дугаараа засаад шинэ дугаараас SMS илгээж солино.
// Нэг урсгал — тусдаа "солих" товч шаардлагагүй.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import PhoneVerify from './PhoneVerify'

export default function MyPhone({ onDone }: { onDone?: (phone: string) => void }) {
  const [current, setCurrent] = useState<{ phone: string; verified: boolean } | null>(null)
  const [phone, setPhone] = useState('')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // PhoneVerify-г шинээр эхлүүлэхэд (key) — алдааны дараа дахин оролдох
  const [round, setRound] = useState(0)

  useEffect(() => {
    fetch('/api/auth/my-phone', { cache: 'no-store' }).then(r => r.json()).then(d => {
      setCurrent({ phone: d.phone, verified: !!d.phoneVerifiedAt })
      setPhone(d.phone)
    }).catch(() => {})
  }, [])

  async function save(verificationId: string | null) {
    if (!verificationId) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/auth/my-phone', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verificationId, phone }),
    }).catch(() => null)
    const d = await res?.json().catch(() => ({}))
    setSaving(false)
    if (!res?.ok) { setError(d?.error || 'Холболтын алдаа гарлаа'); setRound(r => r + 1); return }
    setCurrent({ phone: d.phone, verified: true })
    setOpen(false)
    toast.success(d.changed ? `Утасны дугаар ${d.phone} болж солигдлоо` : 'Утасны дугаар баталгаажлаа')
    onDone?.(d.phone)
  }

  if (!current) return <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>…</p>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', fontVariantNumeric: 'tabular-nums' }}>{current.phone}</div>
          <div style={{ fontSize: '0.8rem', color: current.verified ? 'var(--green)' : 'var(--muted)', fontWeight: 600 }}>
            {current.verified ? '✓ Баталгаажсан' : 'Баталгаажаагүй'}
          </div>
        </div>
        {!open && (
          <button type="button" className={current.verified ? 'btn btn-ghost' : 'btn'} onClick={() => { setOpen(true); setError('') }}>
            {current.verified ? 'Дугаар солих' : 'Баталгаажуулах'}
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: '0.9rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.6rem' }}>
            Одоогийн дугаараа баталгаажуулах эсвэл шинэ дугаараа бичээд тэр утаснаасаа SMS илгээнэ.
            Дугаар солигдвол дараа нь шинэ дугаараараа нэвтэрнэ.
          </p>
          <PhoneVerify key={round} purpose="phone" phone={phone} onPhone={setPhone} onVerified={save} />
          {saving && <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Хадгалж байна…</p>}
          {error && <p className="msg-error">{error}</p>}
          <button type="button" className="pv-link" style={{ fontSize: '0.82rem', color: 'var(--muted)' }}
            onClick={() => { setOpen(false); setPhone(current.phone); setError('') }}>Болих</button>
        </div>
      )}
    </div>
  )
}
