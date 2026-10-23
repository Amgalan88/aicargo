'use client'
// Нэвтэрсэн үедээ нууц үгээ солих маягт — админы тохиргоо болон хэрэглэгчийн тохиргоонд
import { useState } from 'react'
import { toast } from 'sonner'
import PasswordInput from './PasswordInput'

export type ChangePasswordLabels = { current: string; next: string; min: string; submit: string; saving: string; done: string; hint: string }

export const MN_CHANGE_PASSWORD: ChangePasswordLabels = {
  current: 'Одоогийн нууц үг',
  next: 'Шинэ нууц үг',
  min: 'Хамгийн багадаа 6 тэмдэгт',
  submit: 'Нууц үг солих',
  saving: 'Хадгалж байна...',
  done: 'Нууц үг солигдлоо. Бусад төхөөрөмж дээрх нэвтрэлт гарлаа',
  hint: 'Солисны дараа бусад төхөөрөмж дээр шинэ нууц үгээр дахин нэвтэрнэ.',
}

export default function ChangePassword({ labels = MN_CHANGE_PASSWORD, onDone }: { labels?: ChangePasswordLabels; onDone?: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    }).catch(() => null)
    const d = await res?.json().catch(() => ({}))
    setLoading(false)
    if (!res?.ok) { setError(d?.error || 'Холболтын алдаа гарлаа. Дахин оролдоно уу'); return }
    setCurrent('')
    setNext('')
    toast.success(labels.done)
    onDone?.()
  }

  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label>{labels.current}</label>
        <PasswordInput autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} />
      </div>
      <div className="form-group">
        <label>{labels.next}</label>
        <PasswordInput autoComplete="new-password" placeholder={labels.min} required minLength={6}
          value={next} onChange={e => setNext(e.target.value)} />
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 0.6rem' }}>{labels.hint}</p>
      {error && <p className="msg-error">{error}</p>}
      <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>
        {loading ? labels.saving : labels.submit}
      </button>
    </form>
  )
}
