'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminNav from './AdminNav'
import OnboardingCard, { OnboardingState } from './OnboardingCard'
import SuperAnnouncementModal from '@/app/components/SuperAnnouncementModal'

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
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem', textAlign: 'center' }}>🔒</div>
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
        border: '1px solid #f59e0b44', position: 'relative',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '1rem', right: '1rem',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--muted)', fontSize: '1.1rem', lineHeight: 1, padding: '0.2rem',
        }}>✕</button>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem', textAlign: 'center' }}>⚠️</div>
        <h2 style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.1rem', marginBottom: '0.4rem' }}>
          Үйлчилгээний хугацаа дууссан
        </h2>
        <p style={{ textAlign: 'center', fontSize: '0.83rem', color: 'var(--muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Та төлбөрөө <strong style={{ color: '#f59e0b' }}>10 хоногийн дотор</strong> байршуулна уу.
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
  function copy() {
    navigator.clipboard.writeText(value).catch(() => {})
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
          <button onClick={copy} title="Хуулах" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', padding: '0.1rem', lineHeight: 1,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export default function AdminShell({ children, cargoName, logoUrl, cargoSlug, hasGroup, paidUntil, batchEnabled, onboarding }: { children: React.ReactNode; cargoName?: string; logoUrl?: string; cargoSlug?: string; hasGroup?: boolean; paidUntil?: string | null; batchEnabled?: boolean; onboarding?: OnboardingState | null }) {
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
      <AdminNav cargoName={cargoName} logoUrl={logoUrl} cargoSlug={cargoSlug} hasGroup={hasGroup} paidUntil={paidUntil} batchEnabled={batchEnabled} />
      {onboarding && <OnboardingCard state={onboarding} cargoSlug={cargoSlug} batchEnabled={batchEnabled} />}
      <div style={{ minHeight: 'calc(100vh - 96px)' }}>
        {children}
      </div>
      {isBlocked && <BlockingOverlay cargoName={cargoName ?? ''} overdueDays={overdueDays} />}
      {isWarning && !warningDismissed && <WarningBanner cargoName={cargoName ?? ''} onClose={() => setWarningDismissed(true)} />}
      <SuperAnnouncementModal />
    </div>
  )
}
