'use client'
import { useState } from 'react'

function CopyItem({ label, value }: { label: string; value: string }) {
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
          {copied ? '✓' : 'Хуулах'}
        </button>
      </div>
    </div>
  )
}

interface FooterProps {
  cargoName?: string
  ereemReceiver: string
  ereemPhone: string
  ereemRegion?: string
  ereemAddress: string
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
  tariff,
  announcement,
  contactInfo,
  bankName,
  bankAccountHolder,
  bankAccountNumber,
  bankTransferNote,
}: FooterProps) {
  const [activeTab, setActiveTab] = useState<string | null>(null)

  const regionParts = ereemRegion ? ereemRegion.split('·').map(s => s.trim()).filter(Boolean) : []

  return (
    <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', marginTop: '2rem' }}>
      {/* Tab buttons */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'address', label: 'Хаяг' },
          { key: 'tariff', label: 'Тариф' },
          { key: 'announcement', label: 'Анхааруулга' },
          { key: 'contact', label: 'Холбоо барих' },
          { key: 'payment', label: 'Төлбөр' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(activeTab === tab.key ? null : tab.key)}
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
        <div style={{ padding: '0.75rem 5%' }}>
          {activeTab === 'address' && (
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
              {cargoName && (
                <p style={{
                  textAlign: 'center', fontWeight: 700, fontSize: '0.75rem',
                  color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase',
                  marginBottom: '0.75rem',
                }}>{cargoName} хаяг холбох</p>
              )}
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <CopyItem label="收货人 (Нэр)" value={ereemReceiver} />
                <CopyItem label="手机号 (Утас)" value={ereemPhone} />
                {regionParts.length > 0 && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.7rem 0', borderBottom: '1px solid var(--border)', gap: '1rem',
                  }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)', flexShrink: 0 }}>地区 (Бүс)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {regionParts.map((part, i) => (
                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{
                            fontSize: '0.78rem', fontWeight: 500,
                            background: 'var(--surface)', border: '1px solid var(--border)',
                            borderRadius: '5px', padding: '0.2rem 0.5rem', color: 'var(--text)',
                          }}>{part}</span>
                          {i < regionParts.length - 1 && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>›</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <CopyItem label="详细地址 (Хаяг)" value={ereemAddress} />
              </div>
            </div>
          )}
          {activeTab === 'tariff' && (
            tariff
              ? <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.83rem', lineHeight: 1.8 }}>{tariff}</pre>
              : <p style={{ color: 'var(--muted)', fontSize: '0.83rem' }}>Тариф оруулаагүй байна</p>
          )}
          {activeTab === 'announcement' && (
            announcement
              ? <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.83rem', lineHeight: 1.8 }}>{announcement}</pre>
              : <p style={{ color: 'var(--muted)', fontSize: '0.83rem' }}>Анхааруулга байхгүй</p>
          )}
          {activeTab === 'contact' && (
            contactInfo
              ? <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.83rem', lineHeight: 1.8 }}>{contactInfo}</pre>
              : <p style={{ color: 'var(--muted)', fontSize: '0.83rem' }}>Холбоо барих мэдээлэл оруулаагүй</p>
          )}
          {activeTab === 'payment' && (
            bankAccountNumber ? (
              <div style={{ maxWidth: 600, margin: '0 auto', borderTop: '1px solid var(--border)' }}>
                {bankName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Банк</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{bankName}</span>
                  </div>
                )}
                {bankAccountHolder && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Хүлээн авагч</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{bankAccountHolder}</span>
                  </div>
                )}
                <CopyItem label="Дансны дугаар" value={bankAccountNumber} />
                {bankTransferNote && (
                  <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', background: 'var(--accent-light)', borderRadius: 'var(--radius)', border: '1px solid var(--accent)', fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>
                    ⚠ {bankTransferNote}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '0.83rem' }}>Дансны мэдээлэл оруулаагүй байна</p>
            )
          )}
        </div>
      )}
    </footer>
  )
}
