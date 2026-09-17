'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function WarehouseTabs({ id }: { id: number }) {
  const pathname = usePathname()
  const base = `/super/warehouses/${id}`
  const tabs = [
    { href: base, label: 'Тохиргоо, зураг' },
    { href: `${base}/template`, label: 'Гэрээний загвар' },
    { href: `/super/contracts?warehouseId=${id}`, label: 'Гэрээнүүд' },
    { href: `${base}/history`, label: 'Өөрчлөлтийн түүх' },
  ]
  return (
    <nav style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)', margin: '1rem 0 1.25rem', overflowX: 'auto' }}>
      {tabs.map(t => {
        const active = pathname === t.href
        return (
          <Link key={t.href} href={t.href} style={{
            padding: '0.55rem 0.85rem', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap',
            color: active ? 'var(--accent)' : 'var(--muted)',
            borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
            marginBottom: -1,
          }}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
