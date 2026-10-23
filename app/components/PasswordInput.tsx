'use client'
// Нууц үгийн талбар + нүдэн товч: бичиж буй нууц үгээ харж шалгана (хадгалсан нууц үгийг хэн ч харахгүй — шифрлэгдсэн)
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function PasswordInput({ className = 'input', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <div className="pw-wrap">
      <input {...props} className={className} type={show ? 'text' : 'password'} />
      <button type="button" className="pw-eye" onClick={() => setShow(s => !s)}
        aria-label={show ? 'Нууц үгийг нуух' : 'Нууц үгийг харах'} aria-pressed={show} tabIndex={-1}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
