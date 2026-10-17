'use client'
import { useEffect, useState } from 'react'
import { Phone, X, Copy, Check, MessageCircle } from 'lucide-react'

// Эрээнд агуулахтай болох / агуулахтай түншлэх — цахим гэрээний оронд шууд холбогдоно.
// Утас, WeChat QR (public/wechat-qr.png)

export const PARTNER_PHONES = ['85205258']

export function PartnerContactModal({ onClose, title = 'Эрээнд агуулахтай болох' }: { onClose: () => void; title?: string }) {
  const [copied, setCopied] = useState('')
  const [qrOk, setQrOk] = useState(true)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const copy = (v: string) => navigator.clipboard?.writeText(v).then(() => { setCopied(v); setTimeout(() => setCopied(''), 1500) }).catch(() => {})

  return (
    <div className="pc-bg" onClick={onClose}>
      <div className="pc" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <button type="button" className="pc-x" aria-label="Хаах" onClick={onClose}><X size={18} /></button>
        <h3>{title}</h3>
        <p className="pc-sub">Эрээн дэх түнш агуулахтай хамтран ажиллах талаар эдгээр холбоосоор холбогдоно уу.</p>
        <div className="pc-phones">
          {PARTNER_PHONES.map(p => (
            <div key={p} className="pc-phone">
              <a href={`tel:${p}`}><Phone size={17} /><b>{p}</b></a>
              <button type="button" aria-label={`${p} хуулах`} onClick={() => copy(p)}>{copied === p ? <Check size={15} /> : <Copy size={15} />}</button>
            </div>
          ))}
        </div>
        {qrOk && (
          <div className="pc-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wechat-qr.png" alt="WeChat QR код" onError={() => setQrOk(false)} />
            <span><MessageCircle size={14} />WeChat-аар уншуулж нэмнэ үү</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Товч + цонх хамт (сервер хуудсанд шууд тавихад)
export function PartnerContactButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
      {open && <PartnerContactModal onClose={() => setOpen(false)} />}
    </>
  )
}
