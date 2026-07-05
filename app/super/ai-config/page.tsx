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

      <TrainingSection />
    </div>
  )
}

interface Training {
  id: number
  question: string
  answer: string
  active: boolean
  order: number
}

// Сургалтын асуулт-хариулт: router шууд (LLM-гүй, үнэгүй) хариулахад ашиглана
function TrainingSection() {
  const [items, setItems] = useState<Training[]>([])
  const [loading, setLoading] = useState(true)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function load() {
    fetch('/api/super/ai-training')
      .then(r => r.ok ? r.json() : [])
      .then(d => { setItems(d); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function startEdit(t: Training) {
    setEditId(t.id)
    setQuestion(t.question)
    setAnswer(t.answer)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  function reset() {
    setEditId(null)
    setQuestion('')
    setAnswer('')
    setErr('')
  }

  async function save() {
    if (!question.trim() || !answer.trim()) { setErr('Асуулт, хариулт хоёулаа шаардлагатай'); return }
    setSaving(true)
    setErr('')
    const res = await fetch('/api/super/ai-training', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? { id: editId, question, answer } : { question, answer }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error || 'Алдаа гарлаа'); return }
    reset()
    load()
  }

  async function toggle(t: Training) {
    await fetch('/api/super/ai-training', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, active: !t.active }),
    })
    load()
  }

  async function remove(id: number) {
    if (!confirm('Энэ асуулт-хариултыг устгах уу?')) return
    await fetch('/api/super/ai-training', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>🎓 AI Сургалт — асуулт хариулт</h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0.3rem 0 0', lineHeight: 1.6 }}>
          Хэрэглэгч эдгээртэй төстэй асуулт асуухад AI <strong style={{ color: 'var(--text)' }}>LLM дуудалгүй, үнэгүй, агшин зуур</strong> таны
          бэлдсэн хариултыг өгнө. Эхний 3 идэвхтэй асуулт хэрэглэгчийн чатанд санал болгож харагдана.
        </p>
      </div>

      {/* Жагсаалт */}
      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Ачааллаж байна...</p>
      ) : items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {items.map(t => (
            <div key={t.id} className="card" style={{ padding: '0.75rem 1rem', opacity: t.active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>
                    {t.question}
                    {!t.active && <span style={{ fontSize: '0.68rem', color: 'var(--muted)', marginLeft: 6 }}>(идэвхгүй)</span>}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{t.answer}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                  <button onClick={() => toggle(t)} title={t.active ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'} style={trainBtn}>
                    {t.active ? '👁' : '🚫'}
                  </button>
                  <button onClick={() => startEdit(t)} title="Засах" style={trainBtn}>✏️</button>
                  <button onClick={() => remove(t.id)} title="Устгах" style={{ ...trainBtn, color: 'var(--danger)' }}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Нэмэх/засах форм */}
      <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.86rem', marginBottom: '0.75rem' }}>
          {editId ? `Засах — #${editId}` : '+ Шинэ асуулт хариулт'}
        </div>
        <div className="form-group">
          <label>Асуулт</label>
          <input className="input" placeholder="жш: Буцаалт хийж болох уу?"
            value={question} onChange={e => setQuestion(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Хариулт</label>
          <textarea className="input" rows={3}
            placeholder="жш: Хүлээн аваад 24 цагийн дотор гэмтэлтэй бол буцаалт хийнэ. Админтай холбогдоно уу."
            value={answer} onChange={e => setAnswer(e.target.value)} />
        </div>
        {err && <p className="msg-error" style={{ marginBottom: '0.6rem' }}>{err}</p>}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={save} disabled={saving} style={{ fontSize: '0.84rem' }}>
            {saving ? 'Хадгалж...' : editId ? 'Хадгалах' : 'Нэмэх'}
          </button>
          {editId && <button className="btn-ghost" onClick={reset} style={{ fontSize: '0.84rem' }}>Болих</button>}
        </div>
      </div>
    </div>
  )
}

const trainBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', cursor: 'pointer',
  padding: '0.25rem 0.45rem', borderRadius: 6, fontSize: '0.82rem', lineHeight: 1,
}
