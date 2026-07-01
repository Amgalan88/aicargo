export function AIAvatar({
  size = 36,
  glow = false,
  variant = 'A',
}: {
  size?: number
  glow?: boolean
  variant?: 'A' | 'B'
}) {
  const iconSize = Math.round(size * 0.44)

  if (variant === 'B') {
    const r = Math.round(size * 0.28)
    return (
      <div style={{
        width: size, height: size, borderRadius: r, flexShrink: 0,
        background: 'linear-gradient(145deg, #e07a50 0%, #c96442 50%, #a8512e 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
        boxShadow: glow
          ? '0 4px 20px rgba(201,100,66,0.55), 0 0 0 3px rgba(201,100,66,0.18)'
          : '0 2px 10px rgba(201,100,66,0.35)',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: '46%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%)',
          borderRadius: `${r}px ${r}px 0 0`,
        }} />
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={{ position: 'relative' }}>
          <path d="M15 4L20 9L8 21L3 21L3 16L15 4Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M17 2L19 4" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.75"/>
          <path d="M20 5L22 7" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.55"/>
          <circle cx="20" cy="2" r="1" fill="white" opacity="0.6"/>
        </svg>
      </div>
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #e07a50 0%, #c96442 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: glow
        ? '0 4px 20px rgba(201,100,66,0.5), 0 0 0 3px rgba(201,100,66,0.15)'
        : '0 2px 8px rgba(201,100,66,0.3)',
    }}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path d="M12 2L13.6 9.4L21 11L13.6 12.6L12 20L10.4 12.6L3 11L10.4 9.4L12 2Z" fill="white"/>
        <path d="M20 2L20.8 5.2L24 6L20.8 6.8L20 10L19.2 6.8L16 6L19.2 5.2L20 2Z" fill="white" opacity="0.65"/>
      </svg>
    </div>
  )
}
