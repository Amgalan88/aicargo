import Image from 'next/image'

export default function NavLogo({ name, logoUrl }: { name?: string; logoUrl?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', minWidth: 0, overflow: 'hidden' }}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="logo" width={28} height={28} style={{ objectFit: 'contain', borderRadius: 4, flexShrink: 0 }} />
      ) : (
        <Image src="/logo.svg" alt="logo" width={28} height={28} priority style={{ flexShrink: 0 }} />
      )}
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
