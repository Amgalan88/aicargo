import Image from 'next/image'

export default function NavLogo({ name, logoUrl }: { name?: string; logoUrl?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', minWidth: 0, overflow: 'hidden' }}>
      <span style={{
        width: 34, height: 34, borderRadius: 9,
        background: 'var(--accent-light)', border: '1px solid var(--border)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, overflow: 'hidden',
      }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="logo" width={34} height={34} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
        ) : (
          <Image src="/logo.svg" alt="logo" width={24} height={24} priority />
        )}
      </span>
      <span style={{
        fontSize: name ? '0.88rem' : '1.05rem',
        fontWeight: 800, letterSpacing: '-0.3px', lineHeight: 1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--text)',
      }}>
        {name ?? 'cargohub'}
      </span>
    </span>
  )
}
