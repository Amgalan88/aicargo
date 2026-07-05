'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export interface OnboardingState {
  addressDone: boolean
  shipmentDone: boolean
  usersDone: boolean
}

// Шинэ каргогийн эхлүүлэх чеклист — бүгд болмогц дахин харагдахгүй
export default function OnboardingCard({ state, cargoSlug, batchEnabled }: {
  state: OnboardingState
  cargoSlug?: string
  batchEnabled?: boolean
}) {
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    try { setDismissed(localStorage.getItem('onb-dismissed') === '1') } catch { setDismissed(false) }
  }, [])

  const doneCount = [state.addressDone, state.shipmentDone, state.usersDone].filter(Boolean).length
  if (dismissed === null || dismissed || doneCount === 3) return null

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem('onb-dismissed', '1') } catch {}
  }

  function copyInvite() {
    if (!cargoSlug) return
    navigator.clipboard.writeText(`https://${cargoSlug}.aicargo.mn`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const steps: { done: boolean; label: string; action: React.ReactNode }[] = [
    {
      done: state.addressDone,
      label: 'Эрээний хаягаа тохируулах',
      action: <Link href="/admin/settings" style={actionStyle}>Тохируулах →</Link>,
    },
    {
      done: state.shipmentDone,
      label: batchEnabled
        ? 'Эрээний ажилтны эрх үүсгэж, эхний багцаа бүртгүүлэх'
        : 'Эхний ачаагаа бүртгэх',
      action: (
        <Link href={batchEnabled ? '/admin/settings' : '/admin/import'} style={actionStyle}>
          {batchEnabled ? 'Эрх үүсгэх →' : 'Бүртгэх →'}
        </Link>
      ),
    },
    {
      done: state.usersDone,
      label: 'Урилгын линкээ хэрэглэгчдэдээ тараах',
      action: (
        <button onClick={copyInvite} style={{ ...actionStyle, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
          {copied ? '✓ Хуулагдлаа' : 'Линк хуулах'}
        </button>
      ),
    },
  ]

  return (
    <div style={{ padding: '1.1rem 5% 0', maxWidth: 1100, margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--accent)',
        borderRadius: 'var(--radius)', padding: '1rem 1.2rem',
        boxShadow: '0 2px 12px rgba(201,100,66,0.10)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
            <span style={{ fontSize: '1.1rem' }}>🚀</span>
            <strong style={{ fontSize: '0.92rem' }}>Каргогоо бэлэн болгоё</strong>
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)',
              background: 'var(--accent-light)', borderRadius: 100, padding: '0.1rem 0.55rem',
              whiteSpace: 'nowrap',
            }}>
              {doneCount}/3
            </span>
          </div>
          <button onClick={dismiss} aria-label="Хаах" title="Нуух" style={{
            background: 'none', border: 'none', color: 'var(--muted)',
            cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1, padding: '0.2rem', flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 100, marginBottom: '0.85rem', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${(doneCount / 3) * 100}%`,
            background: 'var(--accent)', borderRadius: 100, transition: 'width 0.3s',
          }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {steps.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
              opacity: s.done ? 0.55 : 1,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0, fontSize: '0.84rem' }}>
                <span style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.68rem', fontWeight: 800,
                  background: s.done ? 'var(--green)' : 'var(--surface2)',
                  color: s.done ? '#fff' : 'var(--muted)',
                  border: s.done ? 'none' : '1px solid var(--border)',
                }}>
                  {s.done ? '✓' : i + 1}
                </span>
                <span style={{ textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</span>
              </span>
              {!s.done && <span style={{ flexShrink: 0 }}>{s.action}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const actionStyle: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap',
}
