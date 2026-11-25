'use client'
// Нэг эзэмшигч — олон карго: дээд цэсэнд каргоо солих. Карго бүр өөрийн хаягтай тул тэр хаяг руу шилжинэ
// (тэнд өөрийн дугаар, нууц үгээр нэвтэрнэ — нэвтрэлт хаяг бүрт тусдаа).
import { useEffect, useState } from 'react'
import { ChevronsUpDown, Check, Plus } from 'lucide-react'
import Link from 'next/link'
import { cargoHostUrl } from '@/lib/cargo-url'

export type SwitchCargo = { id: number; name: string; slug: string; home: boolean }

export default function CargoSwitcher({ cargos, currentSlug }: { cargos: SwitchCargo[]; currentSlug?: string }) {
  const [open, setOpen] = useState(false)
  const [host, setHost] = useState('')
  useEffect(() => setHost(window.location.host), [])
  if (cargos.length < 2) return null
  return (
    <div className="cs">
      <button type="button" className="cs-btn" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Карго солих" title="Карго солих">
        <ChevronsUpDown size={16} strokeWidth={2.2} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div className="popover cs-pop" role="menu">
            <p className="cs-title">Миний каргонууд</p>
            {cargos.map(c => {
              const current = c.slug === currentSlug
              return current ? (
                <span key={c.id} className="cs-item on"><Check size={15} />{c.name}</span>
              ) : (
                <a key={c.id} className="cs-item" href={host ? cargoHostUrl(c.slug, host) : '#'} role="menuitem">
                  <span className="cs-dot" />{c.name}<small>{c.slug}</small>
                </a>
              )
            })}
            <Link href="/admin/settings#st-cargos" className="cs-item cs-new" onClick={() => setOpen(false)}><Plus size={15} />Шинэ карго нээх</Link>
          </div>
        </>
      )}
    </div>
  )
}
