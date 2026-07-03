'use client'
import { useState, useEffect } from 'react'

type Theme = 'day' | 'night' | 'comfort'
const ORDER: Theme[] = ['day', 'night', 'comfort']
const LABEL: Record<Theme, string> = {
  day: 'Өдрийн горим',
  night: 'Шөнийн горим',
  comfort: 'Нүдэнд ээлтэй горим',
}

function applyTheme(t: Theme) {
  if (t === 'day') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    let saved: Theme = 'day'
    try {
      const t = localStorage.getItem('theme')
      if (t === 'night' || t === 'comfort') saved = t
    } catch {}
    setTheme(saved)
  }, [])

  function cycle() {
    if (!theme) return
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]
    setTheme(next)
    applyTheme(next)
    try { localStorage.setItem('theme', next) } catch {}
  }

  return (
    <button
      onClick={cycle}
      title={theme ? LABEL[theme] : ''}
      aria-label="Харагдацын горим солих"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 38, height: 38, borderRadius: '50%',
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--muted)', visibility: theme ? 'visible' : 'hidden',
      }}
    >
      {theme === 'night' ? (
        /* Сар */
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>
        </svg>
      ) : theme === 'comfort' ? (
        /* Нүд */
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
      ) : (
        /* Нар */
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.9" y1="4.9" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.1" y2="19.1"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.9" y1="19.1" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.1" y2="4.9"/>
        </svg>
      )}
    </button>
  )
}
