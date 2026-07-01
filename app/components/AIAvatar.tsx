export function AIAvatar({ size = 36, glow = false }: { size?: number; glow?: boolean }) {
  const iconSize = Math.round(size * 0.44)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: glow
        ? '0 4px 20px rgba(99,102,241,0.5), 0 0 0 3px rgba(99,102,241,0.15)'
        : '0 2px 8px rgba(99,102,241,0.3)',
    }}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path d="M12 2L13.6 9.4L21 11L13.6 12.6L12 20L10.4 12.6L3 11L10.4 9.4L12 2Z" fill="white"/>
        <path d="M20 2L20.8 5.2L24 6L20.8 6.8L20 10L19.2 6.8L16 6L19.2 5.2L20 2Z" fill="white" opacity="0.65"/>
      </svg>
    </div>
  )
}
