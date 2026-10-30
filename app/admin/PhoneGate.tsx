'use client'
// Утсаа баталгаажуулаагүй админ (супер админ тухайн каргод шаардсан) — админы хуудас нээгдэхээс өмнө
// жинхэнэ дугаараа SMS-ээр баталгаажуулна. Хуурамч дугаартай бол шинэ дугаараа бичээд тэр утаснаасаа илгээнэ.
import { useRouter } from 'next/navigation'
import MyPhone from '@/app/components/MyPhone'

export default function PhoneGate({ cargoName }: { cargoName: string }) {
  const router = useRouter()
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    router.push('/login')
  }
  return (
    <div className="page" style={{ maxWidth: 460, paddingTop: '3rem' }}>
      <h1 className="section-title">Утсаа баталгаажуулна уу</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.55, margin: '0.5rem 0 1.25rem' }}>
        {cargoName ? <><b>{cargoName}</b> каргоны </> : ''}админ хэсгийг ашиглахын тулд өөрийн <b>жинхэнэ утасны дугаараа</b> SMS-ээр
        баталгаажуулах шаардлагатай. Дугаар буруу бол засаад тэр утаснаасаа кодыг 144773 руу илгээнэ.
      </p>
      <div className="card" style={{ padding: '1.1rem 1.2rem' }}>
        <MyPhone onDone={() => router.refresh()} />
      </div>
      <button type="button" className="btn btn-ghost" onClick={logout} style={{ marginTop: '1.25rem' }}>Гарах</button>
    </div>
  )
}
