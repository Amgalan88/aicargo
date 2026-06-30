'use client'
import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
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
    inputRef.current?.focus()
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
      if (res.ok && data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
        if (data.remaining !== undefined) setRemaining(data.remaining)
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Алдаа гарлаа. Дахин оролдоно уу.' }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Холболтын алдаа гарлаа.' }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); sendMessage() }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', maxWidth: 720, margin: '0 auto', padding: '0 1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0 0.75rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
            🤖
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Admin AI Туслах</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              {remaining !== null ? `Өнөөдөр үлдсэн: ${remaining}/100` : 'Датабаазаас мэдээлэл авна'}
            </div>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); localStorage.removeItem('aai-history') }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}>
            Цэвэрлэх
          </button>
        )}
      </div>

      {/* Quick action buttons */}
      <div style={{ padding: '0.85rem 0 0.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
          {ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => sendMessage(a.prompt)}
              disabled={loading}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '0.55rem 0.75rem',
                fontSize: '0.8rem', color: 'var(--text)',
                cursor: loading ? 'default' : 'pointer',
                textAlign: 'left', fontFamily: 'inherit', fontWeight: 500,
                transition: 'border-color 0.15s, background 0.15s',
                opacity: loading ? 0.6 : 1,
                lineHeight: 1.3,
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg)' } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '1rem 0 0.5rem' }}>

        {messages.length === 0 && !loading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
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
            {msg.role === 'assistant' && (
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
              }}>🤖</div>
            )}
            <div style={{
              maxWidth: '75%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
              color: msg.role === 'user' ? '#fff' : 'var(--text)',
              border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
              fontSize: '0.87rem', lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🤖</div>
            <div style={{ padding: '10px 14px', borderRadius: '4px 18px 18px 18px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '0.75rem 0 1rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: '6px 6px 6px 16px' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Нэмэлт асуулт бичнэ үү..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontFamily: 'inherit', fontSize: '0.87rem',
            }}
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: !input.trim() || loading ? 'var(--border)' : 'var(--accent)',
              cursor: !input.trim() || loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
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
      <style>{`@keyframes adminDot{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-5px);opacity:1}}`}</style>
    </div>
  )
}
