'use client'
import { useState, useRef, useEffect } from 'react'
import { AIAvatar } from './AIAvatar'

interface Message {
  role: 'user' | 'assistant'
  content: string
  clarify?: { question: string; options: string[] }
}

const ACTIONS = [
  { label: '📊 Нийт статистик', prompt: 'Нийт ачааны статистик харуул' },
  { label: '📅 7 хоногийн тайлан', prompt: 'Сүүлийн 7 хоногт ирсэн ачааны өдрийн тоог харуул' },
  { label: '🚛 Эрээнд ирсэн ачаа', prompt: 'Эрээнд ирсэн бүх ачааны жагсаалтыг харуул' },
  { label: '⏳ Удаан хүлээлгэж байгаа ачаа', prompt: 'get_oldest_pending_shipments дуудаж хамгийн удаан нэг статуст байгаа 20 ачааны мэдээлэл болон нийт үнийн дүнг харуул' },
  { label: '👑 Хамгийн идэвхтэй хэрэглэгчид', prompt: 'get_most_active_users дуудаж нийт хэрэглэгчийн тоо болон сүүлийн 3 сард хамгийн идэвхтэй 20 хэрэглэгчийн жагсаалтыг харуул' },
  { label: '💰 Хамгийн өндөр дүнтэй хэрэглэгчид', prompt: 'get_top_value_users дуудаж карго авсан төлөвт байгаа хамгийн өндөр үнийн дүнтэй 20 хэрэглэгчийн жагсаалтыг харуул' },
]

export default function AdminAIChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('aai-history')
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
  }, [])

  useEffect(() => {
    if (messages.length > 0)
      localStorage.setItem('aai-history', JSON.stringify(messages.slice(-20)))
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text?: string) {
    const userText = (text ?? input).trim()
    if (!userText || loading) return

    const userMsg: Message = { role: 'user', content: userText }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      })
      const data = await res.json()
      if (res.status === 429) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error }])
        return
      }
      if (res.ok && data.clarify && data.options) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.question || 'Тодруулна уу:',
          clarify: { question: data.question, options: data.options },
        }])
        if (data.remaining !== undefined) setRemaining(data.remaining)
      } else if (res.ok && data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
        if (data.remaining !== undefined) setRemaining(data.remaining)
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Алдаа гарлаа. Дахин оролдоно уу.' }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Холболтын алдаа гарлаа.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); sendMessage() }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 120px)',
      maxWidth: 720, margin: '0 auto', padding: '0 1rem',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 0 0.85rem',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AIAvatar size={36} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>Admin AI Туслах</div>
            <div style={{ fontSize: '0.71rem', color: 'var(--muted)', marginTop: 1 }}>
              {remaining !== null ? `Өнөөдөр үлдсэн: ${remaining}/30` : 'Датабаазаас мэдээлэл авна'}
            </div>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); localStorage.removeItem('aai-history') }}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--muted)', cursor: 'pointer',
              fontSize: '0.78rem', padding: '0.3rem 0.75rem', fontFamily: 'inherit',
            }}
          >
            Цэвэрлэх
          </button>
        )}
      </div>

      {/* Quick action buttons */}
      <div style={{ padding: '0.75rem 0 0.6rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.4rem' }}>
          {ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => sendMessage(a.prompt)}
              disabled={loading}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 9, padding: '0.5rem 0.7rem',
                fontSize: '0.79rem', color: 'var(--text)',
                cursor: loading ? 'default' : 'pointer',
                textAlign: 'left', fontFamily: 'inherit', fontWeight: 500,
                transition: 'border-color 0.12s, background 0.12s',
                opacity: loading ? 0.6 : 1, lineHeight: 1.3,
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)' } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '0.85rem 0 0.5rem',
      }}>

        {messages.length === 0 && !loading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--muted)', fontSize: '0.84rem', textAlign: 'center', margin: 0 }}>
              Дээрх товчнуудаас сонгох эсвэл асуулт бичнэ үү
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            alignItems: 'flex-end', gap: 8,
          }}>
            {msg.role === 'assistant' && <AIAvatar size={28} />}
            <div style={{ maxWidth: '75%' }}>
              <div style={{
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                color: msg.role === 'user' ? '#fff' : 'var(--text)',
                border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                fontSize: '0.87rem', lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                boxShadow: msg.role === 'user' ? '0 1px 6px rgba(201,100,66,0.22)' : 'none',
              }}>
                {msg.content}
              </div>
              {msg.clarify && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 7 }}>
                  {msg.clarify.options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendMessage(opt)}
                      disabled={loading}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 10, padding: '8px 13px',
                        fontSize: '0.83rem', color: 'var(--text)',
                        cursor: loading ? 'default' : 'pointer',
                        textAlign: 'left', fontFamily: 'inherit', fontWeight: 500,
                        opacity: loading ? 0.6 : 1,
                        transition: 'border-color 0.12s, background 0.12s',
                      }}
                      onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)' } }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <AIAvatar size={28} />
            <div style={{
              padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              boxShadow: 'var(--shadow)',
            }}>
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{ padding: '0.7rem 0 1rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Нэмэлт асуулт бичнэ үү..."
            className="input"
            style={{ flex: 1, fontSize: '0.87rem' }}
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="btn"
            style={{ flexShrink: 0, padding: '0.62rem 1.1rem' }}
          >
            Илгээх
          </button>
        </div>
        <p style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--muted)', margin: '0.4rem 0 0' }}>
          AI алдаа гаргаж болно. Чухал шийдвэрт баталгаажуулаарай.
        </p>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 18 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: 'var(--muted)',
          display: 'inline-block',
          animation: 'adminDot 1.2s infinite',
          animationDelay: `${i * 0.2}s`,
        }} />
      ))}
      <style>{`@keyframes adminDot{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-5px);opacity:1}}`}</style>
    </div>
  )
}
