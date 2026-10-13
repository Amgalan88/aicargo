'use client'
import { useState, useRef, useEffect } from 'react'
import EreenAddresses from './EreenAddresses'
import { cargoAddresses, type EreenAddress } from '@/lib/ereen-address'

function CopyItem({ label, value, copyLabel = 'Хуулах' }: { label: string; value: string; copyLabel?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.7rem 0', borderBottom: '1px solid var(--border)', gap: '1rem',
    }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{value}</span>
        <button onClick={copy} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: copied ? 'var(--green)' : 'var(--muted)',
          fontSize: '0.72rem', fontFamily: 'inherit', fontWeight: 600,
          padding: '0.15rem 0.4rem', borderRadius: '4px',
          transition: 'color 0.15s', flexShrink: 0,
        }}>
          {copied ? '✓' : copyLabel}
        </button>
      </div>
    </div>
  )
}

// Хэрэглэгчийн сонгосон хэлээр (MN/EN/中文) — өгөөгүй бол монголоор
export interface FooterLabels {
  ftAddress: string; ftTariff: string; ftAnnouncement: string; ftContact: string; ftPayment: string; ftAddressTitle: string
  ftNoTariff: string; ftNoAnnouncement: string; ftNoContact: string; ftNoBank: string; ftBank: string; ftHolder: string; ftAccount: string; ftCopy: string
}
const MN_LABELS: FooterLabels = {
  ftAddress: 'Хаяг', ftTariff: 'Тариф', ftAnnouncement: 'Анхааруулга', ftContact: 'Холбоо барих', ftPayment: 'Төлбөр', ftAddressTitle: '{name} хаяг холбох',
  ftNoTariff: 'Тариф оруулаагүй байна', ftNoAnnouncement: 'Анхааруулга байхгүй', ftNoContact: 'Холбоо барих мэдээлэл оруулаагүй', ftNoBank: 'Дансны мэдээлэл оруулаагүй байна',
  ftBank: 'Банк', ftHolder: 'Хүлээн авагч', ftAccount: 'Дансны дугаар', ftCopy: 'Хуулах',
}

interface FooterProps {
  labels?: FooterLabels
  cargoName?: string
  ereemReceiver: string
  ereemPhone: string
  ereemRegion?: string
  ereemAddress: string
  // Олон хаягтай карго (жш: жижиглэн, бөөн) — байхгүй бол дээрх нэг хаяг
  addresses?: EreenAddress[]
  tariff?: string | null
  announcement?: string | null
  contactInfo?: string | null
  bankName?: string | null
  bankAccountHolder?: string | null
  bankAccountNumber?: string | null
  bankTransferNote?: string | null
}

export default function SiteFooter({
  cargoName,
  ereemReceiver,
  ereemPhone,
  ereemRegion,
  ereemAddress,
  addresses,
  tariff,
  announcement,
  contactInfo,
  bankName,
  bankAccountHolder,
  bankAccountNumber,
  bankTransferNote,
  labels = MN_LABELS,
}: FooterProps) {
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const L = labels
  const footerRef = useRef<HTMLElement>(null)
  // Хэсэг нээгдэхэд агуулга нь дэлгэцнээс доогуур үлддэг байсан — нээгдмэгц харагдахуйц гүйлгэнэ
  useEffect(() => {
    if (!activeTab) return
    const id = requestAnimationFrame(() => footerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
    return () => cancelAnimationFrame(id)
  }, [activeTab])

  const addressList = addresses?.length ? addresses : cargoAddresses({ ereemReceiver, ereemPhone, ereemRegion, ereemAddress })

  return (
    <footer ref={footerRef} style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', marginTop: '2rem', scrollMarginBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
      {/* Tab buttons */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'address', label: L.ftAddress },
          { key: 'tariff', label: L.ftTariff },
          { key: 'announcement', label: L.ftAnnouncement },
          { key: 'contact', label: L.ftContact },
          { key: 'payment', label: L.ftPayment },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(activeTab === tab.key ? null : tab.key)}
            aria-expanded={activeTab === tab.key}
            style={{
              flex: 1, padding: '0.75rem 0.25rem', border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit',
              background: activeTab === tab.key ? 'var(--accent-light)' : 'transparent',
              color: activeTab === tab.key ? 'var(--accent)' : 'var(--muted)',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab && (
        // Доод зай: баруун доод буланд хөвдөг "AI туслах" товч агуулгыг халхлахгүй
        <div style={{ padding: '0.75rem 5% 5rem' }}>
          {activeTab === 'address' && (
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
              {cargoName && (
                <p style={{
                  textAlign: 'center', fontWeight: 700, fontSize: '0.75rem',
                  color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase',
                  marginBottom: '0.75rem',
                }}>{L.ftAddressTitle.replace('{name}', cargoName)}</p>
              )}
              <EreenAddresses addresses={addressList} storageKey={cargoName} copyLabel={L.ftCopy} />
            </div>
          )}
          {activeTab === 'tariff' && (
            tariff
              ? <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.83rem', lineHeight: 1.8 }}>{tariff}</pre>
              : <p style={{ color: 'var(--muted)', fontSize: '0.83rem' }}>{L.ftNoTariff}</p>
          )}
          {activeTab === 'announcement' && (
            announcement
              ? <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.83rem', lineHeight: 1.8 }}>{announcement}</pre>
              : <p style={{ color: 'var(--muted)', fontSize: '0.83rem' }}>{L.ftNoAnnouncement}</p>
          )}
          {activeTab === 'contact' && (
            contactInfo
              ? <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.83rem', lineHeight: 1.8 }}>{contactInfo}</pre>
              : <p style={{ color: 'var(--muted)', fontSize: '0.83rem' }}>{L.ftNoContact}</p>
          )}
          {activeTab === 'payment' && (
            bankAccountNumber ? (
              <div style={{ maxWidth: 600, margin: '0 auto', borderTop: '1px solid var(--border)' }}>
                {bankName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{L.ftBank}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{bankName}</span>
                  </div>
                )}
                {bankAccountHolder && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{L.ftHolder}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{bankAccountHolder}</span>
                  </div>
                )}
                <CopyItem label={L.ftAccount} value={bankAccountNumber} copyLabel={L.ftCopy} />
                {bankTransferNote && (
                  <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', background: 'var(--accent-light)', borderRadius: 'var(--radius)', border: '1px solid var(--accent)', fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>
                    ⚠ {bankTransferNote}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '0.83rem' }}>{L.ftNoBank}</p>
            )
          )}
        </div>
      )}
    </footer>
  )
}
