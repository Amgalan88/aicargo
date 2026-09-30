'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminNav from './AdminNav'
import OnboardingCard, { OnboardingState } from './OnboardingCard'
import SuperAnnouncementModal from '@/app/components/SuperAnnouncementModal'
import { Lock, TriangleAlert, X } from 'lucide-react'
import BillingPanel from './BillingPanel'
import { billingState, GRACE_DAYS } from '@/lib/billing'

function BlockingOverlay({ cargoName, overdueDays, paidUntil }: { cargoName: string; overdueDays: number; paidUntil: string | null }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', overflowY: 'auto',
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 16, padding: '2rem',
        maxWidth: 460, width: '100%', maxHeight: '100%', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
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
        <BillingPanel cargoName={cargoName} paidUntil={paidUntil} />
      </div>
    </div>
  )
}

function WarningBanner({ cargoName, paidUntil, daysToBlock, onClose }: { cargoName: string; paidUntil: string | null; daysToBlock: number; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem', overflowY: 'auto',
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 16, padding: '2rem',
        maxWidth: 460, width: '100%', maxHeight: '100%', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
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
          Систем <strong style={{ color: 'var(--yellow)' }}>{daysToBlock > 0 ? `${daysToBlock} хоногийн дараа` : 'маргааш'}</strong> хаагдана.
          Түүнээс өмнө төлбөрөө байршуулна уу.
        </p>
        <BillingPanel cargoName={cargoName} paidUntil={paidUntil} />
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

  // Дууссанаас хойш GRACE_DAYS хоног сануулгатай ажиллана, дараа нь хаагдана (lib/billing)
  const bill = billingState(paidUntil)
  const isBlocked = !!bill?.blocked
  const isWarning = !!bill?.inGrace

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <AdminNav cargoName={cargoName} logoUrl={logoUrl} cargoSlug={cargoSlug} hasGroup={hasGroup} paidUntil={paidUntil} batchEnabled={batchEnabled} isStaffAdmin={isStaffAdmin} />
      {onboarding && <OnboardingCard state={onboarding} cargoSlug={cargoSlug} batchEnabled={batchEnabled} />}
      <div className="admin-content" style={{ minHeight: 'calc(100vh - 96px)' }}>
        {children}
      </div>
      {isBlocked && <BlockingOverlay cargoName={cargoName ?? ''} overdueDays={bill!.overdueDays} paidUntil={paidUntil ?? null} />}
      {isWarning && !warningDismissed && (
        <WarningBanner cargoName={cargoName ?? ''} paidUntil={paidUntil ?? null} daysToBlock={GRACE_DAYS - bill!.overdueDays} onClose={() => setWarningDismissed(true)} />
      )}
      <SuperAnnouncementModal />
    </div>
  )
}
