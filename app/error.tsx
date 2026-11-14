'use client'
import { useEffect } from 'react'

// Хуудас унасан үед (render алдаа) — хэрэглэгчид Монголоор, дахин ачаалах сонголттой
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <main className="sys-page" role="alert" data-testid="error-page">
      <h1 className="sys-page-title">Алдаа гарлаа</h1>
      <p className="sys-page-text">Түр зуурын алдаа байж магадгүй. Дахин оролдоно уу.{error.digest ? ` (код: ${error.digest})` : ''}</p>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" className="btn" onClick={() => reset()}>Дахин ачаалах</button>
        <a href="/" className="sys-page-link">Нүүр рүү</a>
      </div>
    </main>
  )
}
