'use client'
// Утасны талбар + Verify.MN урсгал: хэрэглэгч кодоо өөрийн утаснаасаа 144773 руу SMS-ээр илгээнэ.
// Баталгаажвал onVerified(id) — бүртгүүлэх хүсэлтэд verificationId болгон илгээнэ.
import { useEffect, useRef, useState } from 'react'

type Session = { id: string; code: string; shortcode: string; expiresAt: string; mock: boolean }
type Stage = 'idle' | 'starting' | 'pending' | 'verified' | 'expired'

const POLL_MS = 3000

export default function PhoneVerify({ cargoId, phone, onPhone, onVerified, onNeedsMove }: {
  cargoId: number
  phone: string
  onPhone: (v: string) => void
  onVerified: (id: string | null) => void
  onNeedsMove: () => void
}) {
  const [stage, setStage] = useState<Stage>('idle')
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState('')
  const [left, setLeft] = useState(0)
  const [ios, setIos] = useState(false)
  const checking = useRef(false)
  // Эцэг компонент дахин зурагдахад polling дахин эхлэхгүйн тулд
  const verifiedRef = useRef(onVerified)
  verifiedRef.current = onVerified

  useEffect(() => { setIos(/iphone|ipad|ipod/i.test(navigator.userAgent)) }, [])

  // Хүлээж байх үед 3 сек тутам, SMS апп-аас буцаж ирэхэд шууд шалгана
  useEffect(() => {
    if (stage !== 'pending' || !session) return
    const check = async () => {
      if (checking.current) return
      checking.current = true
      try {
        const r = await fetch(`/api/auth/phone-verify?id=${encodeURIComponent(session.id)}`, { cache: 'no-store' })
        const { status } = await r.json()
        if (status === 'VERIFIED') { setStage('verified'); verifiedRef.current(session.id) }
        if (status === 'EXPIRED') setStage('expired')
      } catch {
        // сүлжээний түр алдаа — дараагийн удаа дахин шалгана
      } finally {
        checking.current = false
      }
    }
    const timer = window.setInterval(check, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    const tick = window.setInterval(() => {
      const ms = new Date(session.expiresAt).getTime() - Date.now()
      setLeft(Math.max(0, Math.floor(ms / 1000)))
      if (ms <= 0) setStage('expired')
    }, 1000)
    return () => {
      window.clearInterval(timer)
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [stage, session])

  async function start() {
    if (!/^\d{8}$/.test(phone)) { setError('Утасны дугаар 8 оронтой байна'); return }
    setError('')
    setStage('starting')
    try {
      const r = await fetch('/api/auth/phone-verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, cargoId }),
      })
      const d = await r.json()
      if (d.code === 'NEEDS_MOVE') { setStage('idle'); onNeedsMove(); return }
      if (!r.ok || !d.ok) { setError(d.error || 'Алдаа гарлаа'); setStage('idle'); return }
      setSession(d)
      setLeft(Math.floor((new Date(d.expiresAt).getTime() - Date.now()) / 1000))
      setStage('pending')
    } catch {
      setError('Сүлжээний алдаа. Дахин оролдоно уу')
      setStage('idle')
    }
  }

  function reset() {
    setSession(null)
    setStage('idle')
    setError('')
    onVerified(null)
  }

  const locked = stage !== 'idle'
  // iOS "&body=", Android "?body="
  const smsHref = session ? `sms:${session.shortcode}${ios ? '&' : '?'}body=${encodeURIComponent(session.code)}` : '#'
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`

  return (
    <div className="form-group">
      <label htmlFor="phone">Утасны дугаар</label>
      <div className="pv-row">
        <input id="phone" className="input" type="tel" inputMode="numeric" autoComplete="tel" placeholder="99000000"
          required maxLength={8} value={phone} readOnly={locked}
          onChange={e => onPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={e => { if (e.key === 'Enter' && stage === 'idle') { e.preventDefault(); start() } }} />
        {stage === 'idle' || stage === 'starting' ? (
          <button type="button" className="btn" onClick={start} disabled={stage === 'starting' || phone.length !== 8}>
            {stage === 'starting' ? '...' : 'Баталгаажуулах'}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={reset}>Солих</button>
        )}
      </div>
      {error && <p className="msg-error" role="alert">{error}</p>}

      {stage === 'pending' && session && (
        <div className="pv-box" aria-live="polite">
          {session.mock && <p className="pv-mock">Туршилтын горим: SMS илгээхгүйгээр хэдэн секундэд баталгаажна</p>}
          <p style={{ margin: 0 }}><strong>{phone}</strong> дугаараасаа <strong>{session.shortcode}</strong> руу энэ кодыг SMS-ээр илгээнэ үү:</p>
          <div className="pv-code">
            <span className="pv-to">→ {session.shortcode}</span>
            <span className="pv-digits">{session.code}</span>
          </div>
          <a className="btn pv-block" href={smsHref}>✉ SMS бичих</a>
          <div className="pv-meta">
            <span><span className="pv-spinner" aria-hidden="true" /> SMS хүлээж байна…</span>
            <span>{mmss} үлдсэн</span>
          </div>
          <p className="pv-note">
            Заавал энэ дугаартай утаснаасаа илгээнэ үү (2 SIM-тэй бол тэр SIM-ээр).
            SMS-ийн үнэ <strong>150₮</strong> — утсанд тань нэгж байх шаардлагатай.
          </p>
        </div>
      )}

      {stage === 'verified' && <p className="pv-ok">✓ Утасны дугаар баталгаажлаа</p>}

      {stage === 'expired' && (
        <p className="msg-error">
          Хугацаа дууссан — хуучин код хүчингүй.{' '}
          <button type="button" className="pv-link" onClick={reset}>Шинэ код авах</button>
        </p>
      )}
    </div>
  )
}
