'use client'
import { useState, useRef, useEffect } from 'react'
import { AIAvatar } from './AIAvatar'
import { AI_SUPPORT_ENABLED } from '@/lib/ai-feature-flag'

interface Message {
  role: 'user' | 'assistant'
  content: string
  clarify?: { question: string; options: string[] }
}

const ACTIONS = [
  { label: '📦 Миний ачааны байдал', prompt: 'Миний ачааны статистикийг харуул' },
  { label: '✅ Ирсэн ачаа', prompt: 'Миний ARRIVED статустай ачааг харуул' },
  { label: '🏢 Компанийн мэдээлэл', prompt: 'Карго компанийн цаг, хаяг, банкны мэдээлэл, дүрмийг харуул' },
  { label: '📋 Сүүлийн ачаануудын жагсаалт', prompt: 'Миний сүүлийн 10 ачааг харуул' },
]

const BTN_H = 38
const BTN_W = 100
const CHAT_W = 336
const CHAT_H = 490

function defaultPos() {
  if (typeof window === 'undefined') return { x: 16, y: 100 }
  return { x: window.innerWidth - BTN_W - 16, y: window.innerHeight - BTN_H - 20 }
}

export default function UserAIWidget({ userName, cargoName, suggestions = [] }: { userName: string; cargoName: string; suggestions?: string[] }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [keyboardH, setKeyboardH] = useState(0)
  const [btnPos, setBtnPos] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ active: false, moved: false, px: 0, py: 0, bx: 0, by: 0 })
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('uai-history')
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
    try {
      const savedPos = localStorage.getItem('uai-pos')
      setBtnPos(savedPos ? JSON.parse(savedPos) : defaultPos())
    } catch {
      setBtnPos(defaultPos())
    }
  }, [])

  useEffect(() => {
    if (messages.length > 0)
      localStorage.setItem('uai-history', JSON.stringify(messages.slice(-20)))
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])


  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      setKeyboardH(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
  }, [])

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    dragRef.current = { active: true, moved: false, px: e.clientX, py: e.clientY, bx: btnPos?.x ?? 0, by: btnPos?.y ?? 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current
    if (!d.active) return
    const dx = e.clientX - d.px, dy = e.clientY - d.py
    if (!d.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
    d.moved = true
    const nx = Math.max(0, Math.min(window.innerWidth - BTN_W - 8, d.bx + dx))
    const ny = Math.max(0, Math.min(window.innerHeight - BTN_H - 8, d.by + dy))
    setBtnPos({ x: nx, y: ny })
  }

  function onPointerUp(_e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current
    d.active = false
    setDragging(false)
    if (btnPos) localStorage.setItem('uai-pos', JSON.stringify(btnPos))
    if (!d.moved) setOpen(o => !o)
  }

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
      if (res.ok && data.clarify && data.options) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.question || 'Тодруулна уу:',
          clarify: { question: data.question, options: data.options },
        }])
        if (data.remaining !== undefined) setRemaining(data.remaining)
      } else if (res.ok && data.reply !== undefined) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'Хариулт хоосон байна.' }])
        if (data.remaining !== undefined) setRemaining(data.remaining)
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error || 'Алдаа гарлаа. Дахин оролдоно уу.' }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Холболтын алдаа гарлаа.' }])
    } finally {
      setLoading(false)
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
      {/* Draggable button */}
      <button
        aria-label="AI Туслах"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: 'fixed',
          left: btnPos?.x ?? 16,
          top: (btnPos?.y ?? 100) - keyboardH,
          zIndex: 1000,
          visibility: btnPos ? 'visible' : 'hidden',
          border: 'none', borderRadius: 50,
          background: 'var(--accent)',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          padding: open ? '0 14px' : '0 13px 0 11px',
          height: BTN_H,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          boxShadow: open
            ? '0 4px 20px rgba(201,100,66,0.45), 0 0 0 3px rgba(201,100,66,0.15)'
            : '0 4px 16px rgba(201,100,66,0.38)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {open ? (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit' }}>Хаах</span>
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.6 9.4L21 11L13.6 12.6L12 20L10.4 12.6L3 11L10.4 9.4L12 2Z" fill="white"/>
              <path d="M20 2L20.8 5.2L24 6L20.8 6.8L20 10L19.2 6.8L16 6L19.2 5.2L20 2Z" fill="white" opacity="0.7"/>
            </svg>
            <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit' }}>AI Туслах</span>
          </>
        )}
      </button>

      {/* Drag wings */}
      {dragging && btnPos && (
        <>
          <style>{`
            @keyframes wingL{0%{opacity:.5;transform:translateY(-50%) translateX(0)}100%{opacity:1;transform:translateY(-50%) translateX(-5px)}}
            @keyframes wingR{0%{opacity:.5;transform:translateY(-50%) translateX(0)}100%{opacity:1;transform:translateY(-50%) translateX(5px)}}
          `}</style>
          <svg width="14" height="22" viewBox="0 0 14 22" fill="none" style={{
            position: 'fixed', pointerEvents: 'none', zIndex: 1001,
            left: btnPos.x - 18,
            top: (btnPos.y - keyboardH) + BTN_H / 2,
            animation: 'wingL 0.45s ease-in-out infinite alternate',
          }}>
            <path d="M11 2L3 11L11 20" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <svg width="14" height="22" viewBox="0 0 14 22" fill="none" style={{
            position: 'fixed', pointerEvents: 'none', zIndex: 1001,
            left: btnPos.x + BTN_W + 4,
            top: (btnPos.y - keyboardH) + BTN_H / 2,
            animation: 'wingR 0.45s ease-in-out infinite alternate',
          }}>
            <path d="M3 2L11 11L3 20" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </>
      )}

      {/* Chat window — full screen */}
      {open && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999,
          background: 'var(--bg)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            padding: '10px 14px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
            flexShrink: 0,
          }}>
            <AIAvatar size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text)' }}>AI Туслах</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cargoName}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
              {remaining !== null && (
                <span style={{
                  fontSize: '0.68rem', color: 'var(--muted)',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '1px 7px',
                }}>
                  {remaining}/5
                </span>
              )}
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); localStorage.removeItem('uai-history') }}
                  style={{
                    background: 'none', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--muted)', cursor: 'pointer',
                    fontSize: '0.7rem', padding: '2px 8px', fontFamily: 'inherit',
                  }}
                >
                  Цэвэрлэх
                </button>
              )}
            </div>
          </div>

          {!AI_SUPPORT_ENABLED ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 10, padding: '2rem 1.5rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '2.2rem' }}>✨</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>Тун удахгүй</div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                AI туслах одоогоор сайжруулалт хийгдэж байна. Удахгүй эргэн ажиллах болно.
              </p>
            </div>
          ) : (
          <>
          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '10px 10px 4px',
            display: 'flex', flexDirection: 'column', gap: 5,
          }}>

            {/* Empty state: quick actions */}
            {messages.length === 0 && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 2 }}>
                <p style={{
                  textAlign: 'center', color: 'var(--muted)',
                  fontSize: '0.76rem', margin: '4px 0 8px',
                }}>
                  Сайн байна уу, {userName}! Юу хийж өгөх вэ?
                </p>
                {ACTIONS.map(a => (
                  <button
                    key={a.label}
                    onClick={() => sendMessage(a.prompt)}
                    disabled={loading}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 10, padding: '9px 12px',
                      fontSize: '0.81rem', color: 'var(--text)',
                      cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'inherit', fontWeight: 500,
                      transition: 'border-color 0.12s, background 0.12s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--accent)'
                      e.currentTarget.style.background = 'var(--accent-light)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.background = 'var(--surface)'
                    }}
                  >
                    {a.label}
                  </button>
                ))}

                {/* Super admin-ий бэлдсэн санал болгох асуултууд */}
                {suggestions.length > 0 && (
                  <>
                    <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.68rem', margin: '8px 0 2px' }}>
                      Түгээмэл асуултууд
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
                      {suggestions.map(s => (
                        <button
                          key={s}
                          onClick={() => sendMessage(s)}
                          disabled={loading}
                          style={{
                            background: 'none', border: '1px solid var(--border)',
                            borderRadius: 12, padding: '4px 10px',
                            fontSize: '0.73rem', color: 'var(--muted)',
                            cursor: 'pointer', fontFamily: 'inherit',
                            transition: 'border-color 0.12s, color 0.12s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'var(--accent)'
                            e.currentTarget.style.color = 'var(--accent)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'var(--border)'
                            e.currentTarget.style.color = 'var(--muted)'
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Message bubbles */}
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-end', gap: 6,
              }}>
                {msg.role === 'assistant' && <AIAvatar size={24} />}
                <div style={{ position: 'relative', maxWidth: '78%' }}>
                  <div style={{
                    padding: '8px 11px',
                    borderRadius: msg.role === 'user'
                      ? '14px 14px 4px 14px'
                      : '14px 14px 14px 4px',
                    background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text)',
                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                    fontSize: '0.83rem', lineHeight: 1.55,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    boxShadow: msg.role === 'user' ? '0 1px 6px rgba(201,100,66,0.22)' : 'var(--shadow)',
                  }}>
                    {msg.content}
                  </div>
                  {msg.clarify && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                      {msg.clarify.options.map((opt, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendMessage(opt)}
                          disabled={loading}
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 10, padding: '7px 11px',
                            fontSize: '0.8rem', color: 'var(--text)',
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

            {/* Quick chips after conversation */}
            {messages.length > 0 && !loading && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '3px 0 0' }}>
                {ACTIONS.map(a => (
                  <button
                    key={a.label}
                    onClick={() => sendMessage(a.prompt)}
                    disabled={loading}
                    style={{
                      background: 'none', border: '1px solid var(--border)',
                      borderRadius: 12, padding: '3px 9px',
                      fontSize: '0.71rem', color: 'var(--muted)',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'border-color 0.12s, color 0.12s', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--accent)'
                      e.currentTarget.style.color = 'var(--accent)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.color = 'var(--muted)'
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <AIAvatar size={24} />
                <div style={{
                  padding: '9px 13px', borderRadius: '14px 14px 14px 4px',
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
          <div style={{
            padding: '8px 10px 10px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Асуулт бичих..."
                className="input"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                style={{ fontSize: '0.83rem', padding: '0.5rem 0.85rem', flex: 1 }}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="btn"
                style={{ padding: '0.5rem 0.85rem', flexShrink: 0, fontSize: '0.83rem' }}
              >
                ↑
              </button>
            </div>
          </div>
          </>
          )}
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
      <style>{`@keyframes uaiDot{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-4px);opacity:1}}`}</style>
    </div>
  )
}
