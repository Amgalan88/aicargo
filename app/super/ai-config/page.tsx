'use client'
import { useEffect, useState } from 'react'

export default function SuperAIConfigPage() {
  const [userPrompt, setUserPrompt] = useState('')
  const [adminPrompt, setAdminPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/super/ai-config')
      .then(r => r.json())
      .then(d => {
        setUserPrompt(d.userPrompt ?? '')
        setAdminPrompt(d.adminPrompt ?? '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/super/ai-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userPrompt, adminPrompt }),
    })
    setSaving(false)
    if (res.ok) {
      setMsg('✓ Хадгалагдлаа')
      setTimeout(() => setMsg(''), 2500)
    } else {
      setMsg('Алдаа гарлаа')
    }
  }

  const ta: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '0.7rem 0.9rem',
    color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.84rem',
    lineHeight: 1.65, resize: 'vertical', outline: 'none',
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h1 className="section-title" style={{ margin: 0 }}>✨ AI Prompt Тохиргоо</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.35rem 0 0', lineHeight: 1.5 }}>
            Бүх карго компанид хамаарах AI туслахын нэмэлт зааврыг тохируулна. Default дүрмүүдийн дээр нэмэгдэнэ.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          {msg && <span style={{ fontSize: '0.8rem', color: msg.startsWith('✓') ? '#22c55e' : 'var(--danger)' }}>{msg}</span>}
          <button
            className="btn"
            onClick={save}
            disabled={saving || loading}
            style={{ fontSize: '0.85rem', padding: '0.5rem 1.4rem' }}
          >
            {saving ? 'Хадгалж...' : 'Хадгалах'}
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          {/* User AI */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ marginBottom: '0.6rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem' }}>👤 Хэрэглэгч AI</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                /orders хуудсан дахь chat widget-д ашиглагдана. Карго компанийн ажиллах цаг, хаяг, онцлог мэдээлэл нэмж болно.
              </div>
            </div>
            <textarea
              value={userPrompt}
              onChange={e => setUserPrompt(e.target.value)}
              placeholder={`Жишээ:
Ажиллах цаг: Да-Ба 9:00-18:00, Бямба 10:00-15:00
Утас: 7700-0000
Гол дүрэм: tool хоосон ирсэн үед дээрх мэдээллийг ашигла.`}
              rows={14}
              style={ta}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* Admin AI */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ marginBottom: '0.6rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem' }}>🛠 Админ AI</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                /admin/ai хуудсан дахь chat-д ашиглагдана. Ажилтны нэр, тариф, тусгай дүрэм зэрэг нэмэлт контекст нэмж болно.
              </div>
            </div>
            <textarea
              value={adminPrompt}
              onChange={e => setAdminPrompt(e.target.value)}
              placeholder={`Жишээ:
Энэ карго жижиг, гэр бүлийн бизнес.
Ажилтан: Болд (9900-0000), Дулма.
Сард ойролцоогоор 500 ачаа хүлээн авдаг.
Тариф: 1кг = 5000₮.`}
              rows={14}
              style={ta}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '1rem 1.25rem', marginTop: '1rem', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0, lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text)' }}>Зөвлөмж:</strong> Prompt-д зөвхөн нэмэлт контекст (цаг, хаяг, тариф) бичнэ.
          AI-н үндсэн дүрмүүд (зөвхөн tool-ын өгөгдлийг ашиглах, монгол хэл, богино хариулт) автоматаар хэвээр ажиллана.
          Prompt-д tool-аас авах боломжтой мэдээллийг давтаж бичих шаардлагагүй — FAQ болон cargo info tool-ууд байна.
        </p>
      </div>
    </div>
  )
}
