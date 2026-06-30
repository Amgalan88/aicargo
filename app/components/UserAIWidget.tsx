'use client'
import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const ACTIONS = [
  { label: '📦 Миний ачааны байдал', prompt: 'Миний ачааны статистикийг харуул' },
  { label: '✅ Ирсэн ачаа', prompt: 'Миний ARRIVED статустай ачааг харуул' },
  { label: '🏢 Компанийн мэдээлэл', prompt: 'Карго компанийн цаг, хаяг, банкны мэдээлэл, дүрмийг харуул' },
  { label: '📋 Сүүлийн ачаануудын жагсаалт', prompt: 'Миний сүүлийн 10 ачааг харуул' },
]

export default function UserAIWidget({
  userName,
  cargoName,
}: {
  userName: string
  cargoName: string
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('uai-history')
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
  }, [])

  useEffect(() => {
    if (messages.length > 0)
      localStorage.setItem('uai-history', JSON.stringify(messages.slice(-20)))
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  async function callAI(msgs: Message[]) {
    setLoading(true)
    try {
      const res = await fetch('/api/user/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs, userName, cargoName }),
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

  async function sendMessage(text?: string) {
    const userText = (text ?? input).trim()
    if (!userText || loading) return
    setInput('')
    const userMsg: Message = { role: 'user', content: userText }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    await callAI(nextMessages)
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--accent)', border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        title="AI Туслах"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
            <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.836 1.37 5.37 3.522 7.07L4.5 22l4.07-2.04A10.6 10.6 0 0012 20.486c5.523 0 10-4.144 10-9.243C22 6.145 17.523 2 12 2z"/>
          </svg>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 88, right: 24, zIndex: 999,
          width: 340, height: 520,
          background: 'var(--bg, #fff)', border: '1px solid var(--border)',
          borderRadius: 18, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            background: 'var(--accent)', padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }}>AI Туслах</div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.72rem' }}>{cargoName}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {remaining !== null && (
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.68rem' }}>{remaining}/20</span>
              )}
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); localStorage.removeItem('uai-history') }}
                  style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: '0.7rem', padding: '3px 8px' }}
                >
                  Цэвэрлэх
                </button>
              )}
            </div>
          </div>

          {/* Messages + Actions */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '10px 10px 4px',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>

            {/* Empty state: show welcome + action buttons */}
            {messages.length === 0 && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.78rem', margin: '4px 0 6px' }}>
                  Сайн байна уу, {userName}! Юу хийж өгөх вэ?
                </p>
                {ACTIONS.map(a => (
                  <button
                    key={a.label}
                    onClick={() => sendMessage(a.prompt)}
                    disabled={loading}
                    style={{
                      background: 'var(--surface, #f5f5f5)',
                      border: '1px solid var(--border)',
                      borderRadius: 12, padding: '10px 14px',
                      fontSize: '0.82rem', color: 'var(--text)',
                      cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'inherit', fontWeight: 500,
                      transition: 'border-color 0.15s, background 0.15s',
                      lineHeight: 1.3,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface, #f5f5f5)' }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-end', gap: 6,
              }}>
                {msg.role === 'assistant' && (
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                  }}>🤖</div>
                )}
                <div style={{
                  maxWidth: '78%',
                  padding: '9px 13px',
                  borderRadius: msg.role === 'user' ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface, #f0f0f0)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text)',
                  fontSize: '0.83rem', lineHeight: 1.55,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Action buttons after messages (quick follow-up) */}
            {messages.length > 0 && !loading && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingTop: 4 }}>
                {ACTIONS.map(a => (
                  <button
                    key={a.label}
                    onClick={() => sendMessage(a.prompt)}
                    disabled={loading}
                    style={{
                      background: 'none', border: '1px solid var(--border)',
                      borderRadius: 16, padding: '5px 10px',
                      fontSize: '0.73rem', color: 'var(--muted)',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'border-color 0.12s, color 0.12s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                }}>🤖</div>
                <div style={{
                  padding: '10px 14px', borderRadius: '4px 18px 18px 18px',
                  background: 'var(--surface, #f0f0f0)', border: '1px solid var(--border)',
                }}>
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '8px 10px 10px',
            borderTop: '1px solid var(--border)',
            display: 'flex', gap: 6, alignItems: 'center',
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Нэмэлт асуулт бичих..."
              style={{
                flex: 1, border: '1px solid var(--border)', borderRadius: 20,
                padding: '8px 14px', fontSize: '0.83rem',
                background: 'var(--surface)', color: 'var(--text)',
                outline: 'none', fontFamily: 'inherit',
              }}
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              style={{
                width: 34, height: 34, borderRadius: '50%', border: 'none',
                background: !input.trim() || loading ? 'var(--border)' : 'var(--accent)',
                cursor: !input.trim() || loading ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'background 0.15s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 16 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--muted)', display: 'inline-block',
          animation: 'uaiDot 1.2s infinite',
          animationDelay: `${i * 0.2}s`,
        }} />
      ))}
      <style>{`@keyframes uaiDot{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1}}`}</style>
    </div>
  )
}
