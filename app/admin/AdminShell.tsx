'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminNav from './AdminNav'
import OnboardingCard, { OnboardingState } from './OnboardingCard'
import SuperAnnouncementModal from '@/app/components/SuperAnnouncementModal'
import { Lock, TriangleAlert, Copy, Check, X } from 'lucide-react'

const BANK_ACCOUNT = '5119007473'
const BANK_NAME = 'Хаан банк'
const ACCOUNT_HOLDER = 'Энхамгалан'
const AMOUNT = '50,000'
const BLOCK_DAYS = 10

function BankInfo({ cargoName }: { cargoName: string }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem', border: '1px solid var(--border)' }}>
      <Row label="Банк" value={BANK_NAME} />
      <Row label="Дансны дугаар" value={BANK_ACCOUNT} mono copyable />
      <Row label="Хүлээн авагч" value={ACCOUNT_HOLDER} />
      <Row label="Гүйлгээний утга" value={cargoName} highlight />
      <Row label="Дүн" value={`${AMOUNT} ₮`} highlight />
    </div>
  )
}

function BlockingOverlay({ cargoName, overdueDays }: { cargoName: string; overdueDays: number }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 16, padding: '2rem',
        maxWidth: 440, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        border: '1px solid var(--border)',
      }}>
        <div className="empty-state-icon" style={{ margin: '0 auto 0.75rem', background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)' }}><Lock size={26} strokeWidth={2} /></div>
        <h2 style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.4rem' }}>
          Үйлчилгээний хугацаа дууссан
        </h2>
        <p style={{ textAlign: 'center', fontSize: '0.83rem', color: 'var(--muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Таны хугацаа <strong style={{ color: 'var(--danger)' }}>{overdueDays} хоног</strong> өмнө дууссан байна.
          Төлбөрөө төлсний дараа системийг дахин ашиглах боломжтой болно.
        </p>
        <BankInfo cargoName={cargoName} />
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
          Төлбөр хийсний дараа <strong style={{ color: 'var(--text)' }}>85205258</strong> дугаарт холбогдоно уу.
        </p>
      </div>
    </div>
  )
}

function WarningBanner({ cargoName, onClose }: { cargoName: string; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 16, padding: '2rem',
        maxWidth: 440, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        border: '1px solid color-mix(in srgb, var(--yellow) 30%, transparent)', position: 'relative',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '1rem', right: '1rem',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--muted)', lineHeight: 1, padding: '0.2rem', display: 'inline-flex',
        }} aria-label="Хаах"><X size={18} /></button>
        <div className="empty-state-icon" style={{ margin: '0 auto 0.75rem', background: 'color-mix(in srgb, var(--yellow) 14%, transparent)', color: 'var(--yellow)' }}><TriangleAlert size={26} strokeWidth={2} /></div>
        <h2 style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.4rem' }}>
          Үйлчилгээний хугацаа дууссан
        </h2>
        <p style={{ textAlign: 'center', fontSize: '0.83rem', color: 'var(--muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Та төлбөрөө <strong style={{ color: 'var(--yellow)' }}>10 хоногийн дотор</strong> байршуулна уу.
          Хугацаа хэтэрвэл систем хаагдах болно.
        </p>
        <BankInfo cargoName={cargoName} />
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
          Төлбөр хийсний дараа <strong style={{ color: 'var(--text)' }}>85205258</strong> дугаарт холбогдоно уу.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, mono, copyable, highlight }: { label: string; value: string; mono?: boolean; copyable?: boolean; highlight?: boolean }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{
          fontSize: '0.88rem', fontWeight: highlight ? 700 : 600,
          fontFamily: mono ? 'monospace' : 'inherit',
          color: highlight ? 'var(--accent)' : 'var(--text)',
          letterSpacing: mono ? '0.03em' : undefined,
        }}>{value}</span>
        {copyable && (
          <button onClick={copy} title="Хуулах" aria-label="Хуулах" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--green)' : 'var(--muted)', padding: '0.2rem', lineHeight: 1, display: 'inline-flex' }}>
            {copied ? <Check size={14} strokeWidth={2.4} /> : <Copy size={14} strokeWidth={2} />}
          </button>
        )}
      </div>
    </div>
  )
}

export default function AdminShell({ children, cargoName, logoUrl, cargoSlug, hasGroup, paidUntil, batchEnabled, onboarding, isStaffAdmin }: { children: React.ReactNode; cargoName?: string; logoUrl?: string; cargoSlug?: string; hasGroup?: boolean; paidUntil?: string | null; batchEnabled?: boolean; onboarding?: OnboardingState | null; isStaffAdmin?: boolean }) {
  const router = useRouter()
  const [warningDismissed, setWarningDismissed] = useState(false)

  useEffect(() => {
    const orig = window.fetch
    window.fetch = async (...args) => {
      const res = await orig(...args)
      if (res.status === 401) router.push('/login')
      return res
    }
    return () => { window.fetch = orig }
  }, [router])

  // overdueDays > 0 means paidUntil has passed
  const overdueDays = paidUntil
    ? Math.floor((Date.now() - new Date(paidUntil).getTime()) / 86_400_000)
    : -1

  const isBlocked = overdueDays > BLOCK_DAYS
  const isWarning = overdueDays >= 0 && overdueDays <= BLOCK_DAYS

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <AdminNav cargoName={cargoName} logoUrl={logoUrl} cargoSlug={cargoSlug} hasGroup={hasGroup} paidUntil={paidUntil} batchEnabled={batchEnabled} isStaffAdmin={isStaffAdmin} />
      {onboarding && <OnboardingCard state={onboarding} cargoSlug={cargoSlug} batchEnabled={batchEnabled} />}
      <div className="admin-content" style={{ minHeight: 'calc(100vh - 96px)' }}>
        {children}
      </div>
      {isBlocked && <BlockingOverlay cargoName={cargoName ?? ''} overdueDays={overdueDays} />}
      {isWarning && !warningDismissed && <WarningBanner cargoName={cargoName ?? ''} onClose={() => setWarningDismissed(true)} />}
      <SuperAnnouncementModal />
    </div>
  )
}
